import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { findDatasetAndAllChildren } from '@fastgpt/service/core/dataset/controller';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { authJWT } from '@fastgpt/service/support/permission/controller';
import { ZipArchive } from 'archiver';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import path from 'path';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { PassThrough } from 'stream';

const EXPORT_LIMIT = parseInt(process.env.EXPORT_LIMIT || '50000', 10);

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

    // 从 JWT payload 中获取 teamId
    const teamId = decoded?.team?.teamId;
    if (!teamId) {
      return res.status(401).json({ error: '无法获取团队信息' });
    }

    // 4. 获取并验证 parentId 和 includeFiles
    const { parentId, includeFiles } = req.body;
    if (!parentId || !/^[0-9a-fA-F]{24}$/.test(parentId)) {
      return res.status(400).json({ error: 'Invalid parentId format' });
    }

    // 5. 递归查找所有子数据集
    const datasets = await findDatasetAndAllChildren({
      teamId,
      datasetId: parentId
    });

    const datasetIds = datasets.map((d) => d._id);

    // 6. 检查数据量是否超过限制
    const [collectionCount, dataCount, dataTextCount, tagCount] = await Promise.all([
      MongoDatasetCollection.countDocuments({ datasetId: { $in: datasetIds } }),
      MongoDatasetData.countDocuments({ datasetId: { $in: datasetIds } }),
      MongoDatasetDataText.countDocuments({ datasetId: { $in: datasetIds } }),
      MongoDatasetCollectionTags.countDocuments({ datasetId: { $in: datasetIds } })
    ]);

    const totalCount = collectionCount + dataCount + dataTextCount + tagCount;
    if (totalCount > EXPORT_LIMIT) {
      return res.status(400).json({
        error: `数据量过大（共 ${totalCount} 条，限制 ${EXPORT_LIMIT} 条），请缩小导出范围后重试`
      });
    }

    // 7. 并行查询所有相关集合
    const [collections, datas, dataTexts, collectionTags] = await Promise.all([
      MongoDatasetCollection.find({ datasetId: { $in: datasetIds } })
        .limit(EXPORT_LIMIT)
        .lean(),
      MongoDatasetData.find({ datasetId: { $in: datasetIds } })
        .limit(EXPORT_LIMIT)
        .lean(),
      MongoDatasetDataText.find({ datasetId: { $in: datasetIds } })
        .limit(EXPORT_LIMIT)
        .lean(),
      MongoDatasetCollectionTags.find({ datasetId: { $in: datasetIds } })
        .limit(EXPORT_LIMIT)
        .lean()
    ]);

    // 8. 组装导出数据
    const exportData = {
      version: '1.0',
      type: 'dataset',
      exportTime: new Date().toISOString(),
      teamId,
      datasets,
      collections,
      datas,
      dataTexts,
      collectionTags
    };

    // 9. 根据是否包含源文件选择导出格式
    if (includeFiles) {
      // 使用 archiver 流式创建 ZIP（避免内存溢出）
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename=dataset-export-${Date.now()}.zip`);

      const archive = new ZipArchive({ zlib: { level: 6 } });

      // 处理归档错误
      archive.on('error', (err: Error) => {
        console.error('Archive error:', err);
        res.status(500).json({ error: 'Archive creation failed' });
      });

      // 管道到响应
      archive.pipe(res);

      // 添加 JSON 数据（使用流式写入，避免内存中保留大字符串）
      const jsonStream = new PassThrough();
      const jsonChunkSize = 1024 * 1024; // 1MB chunks
      const jsonStr = JSON.stringify(exportData, null, 2);

      // 分块写入 JSON 以减少内存峰值
      for (let i = 0; i < jsonStr.length; i += jsonChunkSize) {
        jsonStream.write(jsonStr.substring(i, i + jsonChunkSize));
      }
      jsonStream.end();

      archive.append(jsonStream, { name: 'dataset-export.json' });

      // 收集所有需要导出的 fileId
      const fileCollections = collections.filter(
        (c) => c.type === DatasetCollectionTypeEnum.file && c.fileId
      );

      if (fileCollections.length > 0) {
        const s3Source = getS3DatasetSource();

        // 逐个下载源文件并添加到 ZIP（流式处理，不占用大量内存）
        for (const collection of fileCollections) {
          try {
            const fileId = collection.fileId as string;
            const fileStream = await s3Source.getFileStream(fileId);
            if (fileStream) {
              const filename = path.basename(fileId);
              archive.append(fileStream, { name: `files/${filename}` });
            }
          } catch (error) {
            console.warn(`跳过文件 ${collection.fileId}: ${(error as Error).message}`);
          }
        }
      }

      // 完成归档
      await archive.finalize();
    } else {
      // 只返回 JSON
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=dataset-export-${Date.now()}.json`
      );
      res.status(200).json(exportData);
    }
  } catch (error) {
    console.error('Export dataset error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
}

export default NextAPI(handler);
