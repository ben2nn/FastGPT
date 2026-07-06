import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import type { AddTagsToCollectionsParams } from '@fastgpt/global/core/dataset/api.d';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean } | { error: string }>
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { teamId } = await authAdmin(req);
  const {
    datasetId,
    tag,
    originCollectionIds = [],
    collectionIds = []
  } = req.body as AddTagsToCollectionsParams;
  if (!datasetId || !tag) return res.status(400).json({ error: '缺少 datasetId 或 tag' });

  // 从原集合中移除该标签
  if (originCollectionIds.length > 0) {
    await MongoDatasetCollection.updateMany(
      { _id: { $in: originCollectionIds }, teamId, datasetId },
      { $pull: { tags: tag } }
    );
  }

  // 给目标集合添加该标签（去重）
  if (collectionIds.length > 0) {
    await MongoDatasetCollection.updateMany(
      { _id: { $in: collectionIds }, teamId, datasetId },
      { $addToSet: { tags: tag } }
    );
  }

  return res.status(200).json({ success: true });
}

export default NextAPI(handler);
