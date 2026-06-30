import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';

import { authAdmin } from '@/service/support/permission/auth';
import { type CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreatePostPresignedUrlResult | { error: string }>
) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const authResult = await authAdmin(req);
    const teamId = authResult.teamId;
    if (!teamId) return res.status(401).json({ error: '无法获取团队信息' });

    const { filename, autoExpired } = req.body;
    if (!filename) return res.status(400).json({ error: '缺少 filename' });

    const result = await getS3AvatarSource().createUploadAvatarURL({
      teamId,
      filename,
      autoExpired
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Presign avatar error:', error);
    return res.status(500).json({ error: '获取上传地址失败' });
  }
}

export default NextAPI(handler);
