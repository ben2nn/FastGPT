import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { Types } from 'mongoose';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. 连接数据库
    await connectToDatabase();

    // 2. 验证请求方法
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // 3. 验证身份
    const { teamId, tmbId } = await authCert({ req, authToken: true });

    // 4. 解析请求体
    const { file, keepOriginalId, targetParentId } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'File is required' });
    }

    // 5. 解析 JSON 文件
    let importData;
    try {
      importData = typeof file === 'string' ? JSON.parse(file) : file;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON format' });
    }

    // 6. 验证 JSON 结构
    if (importData.version !== '1.0' || importData.type !== 'dataset') {
      return res.status(400).json({ error: 'Invalid import file format' });
    }

    const { datasets, collections, datas, dataTexts, collectionTags } = importData;

    // 7. 处理 ID 映射
    const idMap = new Map<string, string>();

    if (!keepOriginalId) {
      // 为所有文档生成新 ID
      const allDocs = [...datasets, ...collections, ...datas, ...dataTexts, ...collectionTags];
      for (const doc of allDocs) {
        const oldId = doc._id.toString();
        const newId = new Types.ObjectId().toString();
        idMap.set(oldId, newId);
      }
    }

    // 8. 更新文档引用
    const updateId = (id: string) => {
      if (keepOriginalId) return id;
      return idMap.get(id) || id;
    };

    const updateDoc = (doc: Record<string, unknown>) => {
      const updated = { ...doc };
      updated._id = updateId(doc._id as string);
      if (updated.parentId) {
        updated.parentId = updateId(updated.parentId as string);
      }
      if (updated.datasetId) {
        updated.datasetId = updateId(updated.datasetId as string);
      }
      if (updated.collectionId) {
        updated.collectionId = updateId(updated.collectionId as string);
      }
      updated.teamId = teamId;
      updated.tmbId = tmbId;
      return updated;
    };

    // 9. 更新顶级数据集的 parentId
    const updatedDatasets = datasets.map((doc: Record<string, unknown>) => {
      const updated = updateDoc(doc);
      if (targetParentId) {
        updated.parentId = targetParentId;
      }
      return updated;
    });

    const updatedCollections = collections.map(updateDoc);
    const updatedDatas = datas.map(updateDoc);
    const updatedDataTexts = dataTexts.map(updateDoc);
    const updatedCollectionTags = collectionTags.map(updateDoc);

    // 10. 批量写入数据库
    const [datasetsResult, collectionsResult, datasResult, dataTextsResult, collectionTagsResult] =
      await Promise.all([
        MongoDataset.insertMany(updatedDatasets, { ordered: false }).catch(() => []),
        MongoDatasetCollection.insertMany(updatedCollections, { ordered: false }).catch(() => []),
        MongoDatasetData.insertMany(updatedDatas, { ordered: false }).catch(() => []),
        MongoDatasetDataText.insertMany(updatedDataTexts, { ordered: false }).catch(() => []),
        MongoDatasetCollectionTags.insertMany(updatedCollectionTags, { ordered: false }).catch(
          () => []
        )
      ]);

    // 11. 返回导入结果
    res.status(200).json({
      success: true,
      data: {
        datasetsCount: datasetsResult.length,
        collectionsCount: collectionsResult.length,
        datasCount: datasResult.length,
        dataTextsCount: dataTextsResult.length,
        collectionTagsCount: collectionTagsResult.length
      }
    });
  } catch (error) {
    console.error('Import dataset error:', error);
    res.status(500).json({ error: 'Import failed' });
  }
}

export default NextAPI(handler);
