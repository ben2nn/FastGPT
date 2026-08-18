import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';

import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { authAdmin } from '@/service/support/permission/auth';
import { Types } from 'mongoose';
import formidable from 'formidable';
import { readFile } from 'fs/promises';
import JSZip from 'jszip';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import {
  ADMIN_ONLY_LOCK_TIME,
  getAdminOnlyInitialExpireAt
} from '@/service/core/dataset/training/utils';

// 禁用默认 bodyParser，使用 formidable 处理文件上传
export const config = {
  api: {
    bodyParser: false
  }
};

async function parseFormData(req: NextApiRequest): Promise<{
  fields: formidable.Fields;
  files: formidable.Files;
}> {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 500 * 1024 * 1024, // 500MB
      keepExtensions: true
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
      } else {
        resolve({ fields, files });
      }
    });
  });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. 连接数据库

    // 2. 验证请求方法
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // 3. 验证认证
    const authResult = await authAdmin(req);
    const teamId = authResult.teamId;
    const tmbId = authResult.tmbId;
    if (!teamId || !tmbId) {
      return res.status(401).json({ success: false, error: '无法获取团队信息' });
    }

    // 4. 解析 FormData
    let fields: formidable.Fields;
    let files: formidable.Files;
    try {
      const result = await parseFormData(req);
      fields = result.fields;
      files = result.files;
    } catch (error) {
      console.error('Parse form data error:', error);
      return res
        .status(400)
        .json({ error: '文件上传失败：' + (error instanceof Error ? error.message : '未知错误') });
    }

    // 获取表单字段
    const keepOriginalIdRaw = Array.isArray(fields.keepOriginalId)
      ? fields.keepOriginalId[0]
      : fields.keepOriginalId;
    const keepOriginalId = keepOriginalIdRaw === 'true';
    const targetIdRaw = Array.isArray(fields.targetId) ? fields.targetId[0] : fields.targetId;
    const targetId = targetIdRaw || undefined;
    const targetTypeRaw = Array.isArray(fields.targetType)
      ? fields.targetType[0]
      : fields.targetType;
    const targetType = targetTypeRaw || undefined;
    const ignoreFilesRaw = Array.isArray(fields.ignoreFiles)
      ? fields.ignoreFiles[0]
      : fields.ignoreFiles;
    const ignoreFiles = ignoreFilesRaw === 'true';
    const rebuildIndexRaw = Array.isArray(fields.rebuildIndex)
      ? fields.rebuildIndex[0]
      : fields.rebuildIndex;
    const rebuildIndex = rebuildIndexRaw === 'true';

    // 获取上传的文件
    const fileField = files.file;
    const uploadedFile = Array.isArray(fileField) ? fileField[0] : fileField;
    if (!uploadedFile) {
      return res.status(400).json({ error: '请上传 JSON 或 ZIP 文件' });
    }

    // 5. 读取并解析文件（支持 JSON 和 ZIP）
    let importData: Record<string, unknown>;
    let fileMap = new Map<string, Buffer>(); // filename -> fileBuffer

    const filename = uploadedFile.originalFilename || '';
    const isZip = filename.toLowerCase().endsWith('.zip');

    if (isZip) {
      // 解析 ZIP 文件
      try {
        const fileBuffer = await readFile(uploadedFile.filepath);
        const zip = await JSZip.loadAsync(fileBuffer);

        // 读取 JSON 数据
        const jsonFile = zip.file('dataset-export.json');
        if (!jsonFile) {
          return res.status(400).json({ error: 'ZIP 文件中缺少 dataset-export.json' });
        }
        const jsonContent = await jsonFile.async('string');
        importData = JSON.parse(jsonContent) as Record<string, unknown>;

        // 读取源文件（如果不需要忽略）
        if (!ignoreFiles) {
          const filesFolder = zip.folder('files');
          if (filesFolder) {
            const filePromises: Promise<void>[] = [];
            filesFolder.forEach((relativePath, file) => {
              if (!file.dir) {
                filePromises.push(
                  file.async('nodebuffer').then((buffer) => {
                    fileMap.set(relativePath, buffer);
                  })
                );
              }
            });
            await Promise.all(filePromises);
          }
        }

        // 清理 ZIP 对象释放内存
        zip.remove('');
      } catch (error) {
        console.error('Parse ZIP error:', error);
        const errMsg = error instanceof Error ? error.message : 'ZIP 文件格式错误';
        return res.status(400).json({ error: errMsg });
      }
    } else {
      // 解析 JSON 文件
      try {
        const fileContent = await readFile(uploadedFile.filepath, 'utf-8');
        importData = JSON.parse(fileContent) as Record<string, unknown>;
      } catch (error) {
        console.error('Parse JSON error:', error);
        return res.status(400).json({ error: 'JSON 文件格式错误' });
      }
    }

    // 5.5 验证导入数据的基本结构
    if (!importData || typeof importData !== 'object') {
      return res.status(400).json({ error: '导入数据格式错误：应为 JSON 对象' });
    }

    // 6. 验证 JSON 结构
    if (importData.version !== '1.0' || importData.type !== 'dataset') {
      return res.status(400).json({ error: 'Invalid import file format' });
    }

    const { datasets, collections, datas, dataTexts, collectionTags } = importData as {
      datasets: Record<string, unknown>[];
      collections: Record<string, unknown>[];
      datas: Record<string, unknown>[];
      dataTexts: Record<string, unknown>[];
      collectionTags: Record<string, unknown>[];
    };

    // 验证数组字段
    if (
      !Array.isArray(datasets) ||
      !Array.isArray(collections) ||
      !Array.isArray(datas) ||
      !Array.isArray(dataTexts) ||
      !Array.isArray(collectionTags)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid import file structure: missing required arrays'
      });
    }

    // 6.5. 检查导入数据量限制
    const IMPORT_LIMIT = parseInt(process.env.IMPORT_LIMIT || '50000', 10);
    const totalDocs =
      datasets.length +
      collections.length +
      datas.length +
      dataTexts.length +
      collectionTags.length;
    if (totalDocs > IMPORT_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `导入数据量超过限制：${totalDocs} 条，最大允许 ${IMPORT_LIMIT} 条`
      });
    }

    // 7. 处理 ID 映射（逐个集合遍历，避免 allDocs 展开导致内存倍增）
    const idMap = new Map<string, string>();

    if (!keepOriginalId) {
      for (const arr of [datasets, collections, datas, dataTexts, collectionTags]) {
        for (const doc of arr) {
          idMap.set(String(doc._id), new Types.ObjectId().toString());
        }
      }
    }

    // 8. 原地更新文档引用（不创建副本，直接修改原数组中的对象）
    function updateDoc(doc: Record<string, unknown>) {
      if (!keepOriginalId) {
        doc._id = idMap.get(String(doc._id)) || doc._id;
        if (doc.parentId) {
          const oldParentId = String(doc.parentId);
          const mapped = idMap.get(oldParentId);
          doc.parentId = mapped || null;
        }
        if (doc.datasetId) doc.datasetId = idMap.get(String(doc.datasetId)) || doc.datasetId;
        if (doc.collectionId)
          doc.collectionId = idMap.get(String(doc.collectionId)) || doc.collectionId;
        if (doc.dataId) doc.dataId = idMap.get(String(doc.dataId)) || doc.dataId;
      }
      doc.teamId = teamId;
      doc.tmbId = tmbId;
    }

    // 8.5. 目标位置重复检测
    if (targetId) {
      if (targetType === 'folder') {
        // 目录：递归查找目录下所有子知识库，按 _id 检测重复
        const allDescendants: string[] = [];
        const collectChildren = async (parentId: string) => {
          const kids = await MongoDataset.find({ teamId, parentId }, '_id').lean();
          for (const kid of kids) {
            allDescendants.push(String(kid._id));
            await collectChildren(String(kid._id));
          }
        };
        await collectChildren(targetId);

        const existingIdSet = new Set(allDescendants);
        const importIds = datasets.map((doc: Record<string, unknown>) => String(doc._id));
        const conflictIds = importIds.filter((id: string) => existingIdSet.has(id));

        if (conflictIds.length > 0) {
          return res.status(409).json({
            success: false,
            error: `目标目录下已存在 ${conflictIds.length} 个同 ID 知识库，请先删除后再导入`
          });
        }
      } else {
        // 知识库：按 _id 查找
        const existingDataset = await MongoDataset.findOne({ _id: targetId, teamId });
        if (existingDataset) {
          return res.status(409).json({
            success: false,
            error: `目标知识库「${existingDataset.name}」已存在，请先删除后再导入`
          });
        }
      }
    }

    // 9. 原地更新顶级数据集的 parentId
    for (const doc of datasets) {
      updateDoc(doc);
      if (targetType === 'folder' && targetId) doc.parentId = targetId;
    }
    collections.forEach(updateDoc);
    datas.forEach(updateDoc);
    dataTexts.forEach(updateDoc);
    collectionTags.forEach(updateDoc);

    // 源环境的向量 dataId 在新环境无效（PG BIGSERIAL 自增，跨环境必然重复），
    // 若保留则重建索引后会误删新环境中同 ID 的向量。
    // 注意：不能在插入前 delete idx.dataId——schema 中 dataId 为 required:true，
    // Mongoose insertMany 在 ordered:false 时会静默跳过校验失败的文档，导致整条数据丢失。
    // 因此在数据插入成功后统一 $unset 清除（见下方第 11 步）。

    // 释放 idMap，减少内存占用
    if (!keepOriginalId) {
      idMap.clear();
    }

    // 10. 处理源文件上传和类型转换
    const s3Source = getS3DatasetSource();
    const uploadedFileMap = new Map<string, string>(); // oldFileId -> newFileId

    // 上传完成后释放 fileMap 内存
    const processCollections = async () => {
      for (const collection of collections) {
        if (collection.type === DatasetCollectionTypeEnum.file) {
          const oldFileId = collection.fileId as string;

          if (ignoreFiles || !oldFileId) {
            // 忽略源文件或没有 fileId，改为 virtual 类型
            collection.type = DatasetCollectionTypeEnum.virtual;
            collection.fileId = null;
          } else if (fileMap.size > 0) {
            // 尝试从 ZIP 中找到对应的源文件并上传
            const filename = oldFileId.split('/').pop() || '';
            const fileBuffer = fileMap.get(filename);

            if (fileBuffer) {
              try {
                // 上传到 S3，使用原始文件名确保一致性
                const datasetId = collection.datasetId as string;
                const newFileId = await s3Source.upload({
                  datasetId,
                  filename: filename, // 使用原始文件名而非 collection.name
                  buffer: fileBuffer
                });
                collection.fileId = newFileId;
                uploadedFileMap.set(oldFileId, newFileId);
              } catch (error) {
                console.warn(`上传文件失败 ${oldFileId}: ${(error as Error).message}`);
                // 上传失败，改为 virtual
                collection.type = DatasetCollectionTypeEnum.virtual;
                collection.fileId = null;
              }
            } else {
              // ZIP 中找不到对应文件，改为 virtual
              collection.type = DatasetCollectionTypeEnum.virtual;
              collection.fileId = null;
            }
          }
        }
      }
    };

    await processCollections();

    // 释放 fileMap 内存
    fileMap.clear();

    // 11. 分批写入数据库（顺序执行，降低 MongoDB 连接压力）
    const BATCH_SIZE = 2000;
    const duplicateWarnings: string[] = [];

    async function batchInsert<T extends Record<string, unknown>>(
      model: { insertMany: (docs: T[], opts: Record<string, unknown>) => Promise<T[]> },
      docs: T[],
      name: string
    ): Promise<Set<string>> {
      const insertedIds = new Set<string>();
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        try {
          const result = await model.insertMany(batch, { ordered: false });
          result.forEach((doc) => insertedIds.add(String(doc._id)));
        } catch (err: unknown) {
          // Mongoose 在 driver 写入错误（如 11000 重复键）时会在错误对象上
          // 填充 insertedDocs（成功插入的文档数组），据此恢复成功插入的 _id
          const bulkErr = err as { code?: number; insertedDocs?: unknown[] };
          if (bulkErr.code === 11000) {
            const inserted = bulkErr.insertedDocs ?? [];
            inserted.forEach((doc) =>
              insertedIds.add(String((doc as Record<string, unknown>)._id))
            );
            const dupCount = batch.length - inserted.length;
            duplicateWarnings.push(`${name}: ${dupCount} 条重复已跳过`);
          } else {
            throw err;
          }
        }
      }
      return insertedIds;
    }

    const datasetsIds = await batchInsert(MongoDataset, datasets, 'datasets');
    const collectionsIds = await batchInsert(MongoDatasetCollection, collections, 'collections');
    const datasIds = await batchInsert(MongoDatasetData, datas, 'datas');
    const dataTextsIds = await batchInsert(MongoDatasetDataText, dataTexts, 'dataTexts');
    const collectionTagsIds = await batchInsert(
      MongoDatasetCollectionTags,
      collectionTags,
      'collectionTags'
    );

    // 清除源环境向量 dataId（必须在创建训练任务之前完成）：
    // 保留原值会在 rebuildData 重建时误删新环境中同 ID 的向量
    if (datasIds.size > 0) {
      const idList = [...datasIds].map((id) => new Types.ObjectId(id));
      for (let i = 0; i < idList.length; i += BATCH_SIZE) {
        await MongoDatasetData.updateMany(
          { _id: { $in: idList.slice(i, i + BATCH_SIZE) } },
          { $unset: { 'indexes.$[].dataId': 1 } }
        );
      }
    }

    // 12. 如果需要重建索引，为导入的数据创建训练任务
    let rebuildTasksCount = 0;
    if (rebuildIndex && datas.length > 0) {
      try {
        // 获取导入的数据集信息（用于获取 vectorModel 和 agentModel）
        const importedDatasetIds = [...new Set(collections.map((c) => c.datasetId as string))];
        const datasetDocs = await MongoDataset.find({
          _id: { $in: importedDatasetIds }
        })
          .select('_id vectorModel agentModel')
          .lean();

        const datasetMap = new Map(datasetDocs.map((d) => [String(d._id), d]));

        // 创建训练账单
        const firstDataset = datasetDocs[0];
        if (firstDataset) {
          const { usageId } = await createTrainingUsage({
            teamId,
            tmbId,
            appName: '导入后重建索引',
            billSource: UsageSourceEnum.training,
            vectorModel: firstDataset.vectorModel,
            agentModel: firstDataset.agentModel
          });

          // 为每个实际插入成功的数据创建训练任务：
          // 1. 必须带 dataId：数据已直接写入 MongoDatasetData，
          //    带 dataId 才会走 generateVector 的 rebuildData（更新已有行并重建向量），
          //    否则走 insertData 会新建重复数据，导致数据条数翻倍
          // 2. 过滤被跳过（重复/冲突）的数据，避免产生指向不存在数据的
          //    孤儿任务（[Vector Queue] Not data 错误）
          const trainingData = datas
            .filter((data) => datasIds.has(String(data._id)))
            .map((data) => ({
              teamId,
              tmbId,
              datasetId: data.datasetId as string,
              collectionId: data.collectionId as string,
              billId: usageId,
              mode: TrainingModeEnum.chunk,
              dataId: data._id as string,
              q: data.q as string,
              a: data.a as string,
              chunkIndex: (data.chunkIndex as number) || 0,
              retryCount: 5,
              // admin 专属任务:lockTime 远期值使 app 队列(lockTime <= now-3min)永不拾取;
              // expireAt 设过去时间,创建后立即可被 admin 拾取
              lockTime: ADMIN_ONLY_LOCK_TIME,
              expireAt: getAdminOnlyInitialExpireAt()
            }));

          // 分批插入训练任务
          const TRAINING_BATCH_SIZE = 500;
          for (let i = 0; i < trainingData.length; i += TRAINING_BATCH_SIZE) {
            const batch = trainingData.slice(i, i + TRAINING_BATCH_SIZE);
            try {
              await MongoDatasetTraining.insertMany(batch, { ordered: false });
              rebuildTasksCount += batch.length;
            } catch (error) {
              console.warn(`插入训练任务失败: ${(error as Error).message}`);
            }
          }

          console.log(`已创建 ${rebuildTasksCount} 个重建索引训练任务`);
        }
      } catch (error) {
        console.warn('创建重建索引任务失败:', (error as Error).message);
      }
    }

    // 13. 返回导入结果
    res.status(200).json({
      success: true,
      data: {
        datasetsCount: datasetsIds.size,
        collectionsCount: collectionsIds.size,
        datasCount: datasIds.size,
        dataTextsCount: dataTextsIds.size,
        collectionTagsCount: collectionTagsIds.size,
        uploadedFilesCount: uploadedFileMap.size,
        rebuildTasksCount: rebuildIndex ? rebuildTasksCount : undefined,
        ...(duplicateWarnings.length > 0 ? { warnings: duplicateWarnings } : {})
      }
    });
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    console.error('Import dataset error:', errMsg);
    res.status(500).json({ success: false, error: errMsg });
  }
}

export default NextAPI(handler);
