import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import type { UpdateDatasetCollectionTagParams } from '@fastgpt/global/core/dataset/api.d';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean } | { error: string }>
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { teamId } = await authAdmin(req);
  const { datasetId, tagId, tag } = req.body as UpdateDatasetCollectionTagParams;
  if (!datasetId || !tagId || !tag) {
    return res.status(400).json({ error: '缺少 datasetId、tagId 或 tag' });
  }

  await MongoDatasetCollectionTags.updateOne({ _id: tagId, teamId, datasetId }, { $set: { tag } });

  return res.status(200).json({ success: true });
}

export default NextAPI(handler);
