import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { authJWT } from '@fastgpt/service/support/permission/controller';
import { Types } from 'mongoose';
import formidable from 'formidable';
import { readFile } from 'fs/promises';

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
    await connectToDatabase();

    // 2. 验证请求方法
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // 3. 验证 JWT Token
    const authHeader = req.headers.authorization;
    const token = req.headers.token as string | undefined;

    let jwtToken: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      jwtToken = authHeader.substring(7);
    } else if (token) {
      jwtToken = token;
    }

    if (!jwtToken) {
      return res.status(401).json({ error: 'Token 不存在' });
    }

    let decoded;
    try {
      decoded = await authJWT(jwtToken);
    } catch (error) {
      return res.status(401).json({ error: 'Token 无效或已过期' });
    }

    // 从 JWT payload 中获取 teamId 和 tmbId
    const teamId = decoded?.team?.teamId;
    const tmbId = decoded?.team?.tmbId;
    if (!teamId || !tmbId) {
      return res.status(401).json({ error: '无法获取团队信息' });
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
    const targetParentIdRaw = Array.isArray(fields.targetParentId)
      ? fields.targetParentId[0]
      : fields.targetParentId;
    const targetParentId = targetParentIdRaw || undefined;

    // 获取上传的文件
    const fileField = files.file;
    const uploadedFile = Array.isArray(fileField) ? fileField[0] : fileField;
    if (!uploadedFile) {
      return res.status(400).json({ error: '请上传 JSON 文件' });
    }

    // 5. 读取并解析 JSON 文件
    let importData;
    try {
      const fileContent = await readFile(uploadedFile.filepath, 'utf-8');
      importData = JSON.parse(fileContent);
    } catch (error) {
      console.error('Parse JSON error:', error);
      return res.status(400).json({ error: 'JSON 文件格式错误' });
    }

    // 5.5 验证导入数据的基本结构
    if (!importData || typeof importData !== 'object') {
      return res.status(400).json({ error: '导入数据格式错误：应为 JSON 对象' });
    }

    // 6. 验证 JSON 结构
    if (importData.version !== '1.0' || importData.type !== 'dataset') {
      return res.status(400).json({ error: 'Invalid import file format' });
    }

    const { datasets, collections, datas, dataTexts, collectionTags } = importData;

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

    // 9. 原地更新顶级数据集的 parentId
    for (const doc of datasets) {
      updateDoc(doc);
      if (targetParentId) doc.parentId = targetParentId;
    }
    collections.forEach(updateDoc);
    datas.forEach(updateDoc);
    dataTexts.forEach(updateDoc);
    collectionTags.forEach(updateDoc);

    // 释放 idMap，减少内存占用
    if (!keepOriginalId) {
      idMap.clear();
    }

    // 10. 分批写入数据库（顺序执行，降低 MongoDB 连接压力）
    const BATCH_SIZE = 2000;
    const duplicateWarnings: string[] = [];

    async function batchInsert<T extends Record<string, unknown>>(
      model: { insertMany: (docs: T[], opts: Record<string, unknown>) => Promise<T[]> },
      docs: T[],
      name: string
    ) {
      let insertedCount = 0;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        try {
          const result = await model.insertMany(batch, { ordered: false });
          insertedCount += result.length;
        } catch (err: unknown) {
          if (err instanceof Error && 'code' in err && (err as { code: number }).code === 11000) {
            const writeResult = (err as { result?: { insertedCount?: number } }).result;
            if (writeResult?.insertedCount) {
              insertedCount += writeResult.insertedCount;
            }
            const dupCount = batch.length - (writeResult?.insertedCount ?? 0);
            duplicateWarnings.push(`${name}: ${dupCount} 条重复已跳过`);
          } else {
            throw err;
          }
        }
      }
      return insertedCount;
    }

    const datasetsCount = await batchInsert(MongoDataset, datasets, 'datasets');
    const collectionsCount = await batchInsert(MongoDatasetCollection, collections, 'collections');
    const datasCount = await batchInsert(MongoDatasetData, datas, 'datas');
    const dataTextsCount = await batchInsert(MongoDatasetDataText, dataTexts, 'dataTexts');
    const collectionTagsCount = await batchInsert(
      MongoDatasetCollectionTags,
      collectionTags,
      'collectionTags'
    );

    // 11. 返回导入结果
    res.status(200).json({
      success: true,
      data: {
        datasetsCount,
        collectionsCount,
        datasCount,
        dataTextsCount,
        collectionTagsCount,
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
