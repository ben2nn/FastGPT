import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import type { TagUsageType } from '@fastgpt/global/core/dataset/type';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TagUsageType[] | { error: string }>
) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { teamId } = await authAdmin(req);
  const datasetId = req.query.datasetId as string;
  if (!datasetId) return res.status(400).json({ error: '缺少 datasetId' });

  const tags = await MongoDatasetCollectionTags.find({ teamId, datasetId }).lean();

  const result: TagUsageType[] = [];
  for (const tag of tags) {
    const collections = await MongoDatasetCollection.find(
      { teamId, datasetId, tags: String(tag._id) },
      { _id: 1 }
    ).lean();
    result.push({
      tagId: String(tag._id),
      collections: collections.map((c) => String(c._id))
    });
  }

  return res.status(200).json(result);
}

export default NextAPI(handler);
