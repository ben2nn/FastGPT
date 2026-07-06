import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import type { DatasetTagType } from '@fastgpt/global/core/dataset/type';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ list: DatasetTagType[] } | { error: string }>
) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { teamId } = await authAdmin(req);
  const datasetId = req.query.datasetId as string;
  if (!datasetId) return res.status(400).json({ error: '缺少 datasetId' });

  const list = await MongoDatasetCollectionTags.find({ teamId, datasetId }).sort({ tag: 1 }).lean();

  return res.status(200).json({
    list: list.map((item) => ({ _id: String(item._id), tag: item.tag }))
  });
}

export default NextAPI(handler);
