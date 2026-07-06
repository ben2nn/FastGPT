import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean } | { error: string }>
) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const { teamId } = await authAdmin(req);
  const { id, datasetId } = req.query as { id: string; datasetId: string };
  if (!id || !datasetId) return res.status(400).json({ error: '缺少 id 或 datasetId' });

  // 删除标签
  await MongoDatasetCollectionTags.deleteOne({ _id: id, teamId, datasetId });

  // 从所有集合中移除该标签引用
  await MongoDatasetCollection.updateMany({ teamId, datasetId, tags: id }, { $pull: { tags: id } });

  return res.status(200).json({ success: true });
}

export default NextAPI(handler);
