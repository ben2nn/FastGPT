import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import type { CreateDatasetCollectionTagParams } from '@fastgpt/global/core/dataset/api.d';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ id: string } | { error: string }>
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { teamId } = await authAdmin(req);
  const { datasetId, tag } = req.body as CreateDatasetCollectionTagParams;
  if (!datasetId || !tag) return res.status(400).json({ error: '缺少 datasetId 或 tag' });

  const existing = await MongoDatasetCollectionTags.findOne({ teamId, datasetId, tag });
  if (existing) {
    return res.status(200).json({ id: String(existing._id) });
  }

  const doc = await MongoDatasetCollectionTags.create({ teamId, datasetId, tag });
  return res.status(200).json({ id: String(doc._id) });
}

export default NextAPI(handler);
