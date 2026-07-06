import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import type { DatasetTagType } from '@fastgpt/global/core/dataset/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

type Body = PaginationProps<{ datasetId: string; searchText?: string }>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PaginationResponse<DatasetTagType> | { error: string }>
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { teamId } = await authAdmin(req);
  const { datasetId, searchText, offset = 0, pageSize = 20 } = req.body as Body;
  if (!datasetId) return res.status(400).json({ error: '缺少 datasetId' });

  const match: Record<string, any> = { teamId, datasetId };
  if (searchText) {
    match.tag = { $regex: searchText, $options: 'i' };
  }

  const [list, total] = await Promise.all([
    MongoDatasetCollectionTags.find(match).sort({ tag: 1 }).skip(offset).limit(pageSize).lean(),
    MongoDatasetCollectionTags.countDocuments(match)
  ]);

  return res.status(200).json({
    list: list.map((item) => ({ _id: String(item._id), tag: item.tag })),
    total
  });
}

export default NextAPI(handler);
