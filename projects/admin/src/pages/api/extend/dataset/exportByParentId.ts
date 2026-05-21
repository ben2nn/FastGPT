import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { findDatasetAndAllChildren } from '@fastgpt/service/core/dataset/controller';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. 连接数据库
    await connectToDatabase();

    // 2. 验证请求方法
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // 3. 验证身份
    const { teamId } = await authCert({ req, authToken: true });

    // 4. 获取并验证 parentId
    const { parentId } = req.body;
    if (!parentId || !/^[0-9a-fA-F]{24}$/.test(parentId)) {
      return res.status(400).json({ error: 'Invalid parentId format' });
    }

    // 5. 递归查找所有子数据集
    const datasets = await findDatasetAndAllChildren({
      teamId,
      datasetId: parentId
    });

    const datasetIds = datasets.map((d) => d._id);

    // 6. 并行查询所有相关集合
    const [collections, datas, dataTexts, collectionTags] = await Promise.all([
      MongoDatasetCollection.find({ datasetId: { $in: datasetIds } }).lean(),
      MongoDatasetData.find({ datasetId: { $in: datasetIds } }).lean(),
      MongoDatasetDataText.find({ datasetId: { $in: datasetIds } }).lean(),
      MongoDatasetCollectionTags.find({ datasetId: { $in: datasetIds } }).lean()
    ]);

    // 7. 组装导出数据
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

    // 8. 设置响应头并返回
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=dataset-export-${Date.now()}.json`
    );
    res.status(200).json(exportData);
  } catch (error) {
    console.error('Export dataset error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
}

export default NextAPI(handler);
