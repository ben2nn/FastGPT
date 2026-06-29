import type { NextApiResponse } from 'next';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { clearCookie } from '@fastgpt/service/support/permission/auth/common';
import { delUserAllSession } from '@fastgpt/service/support/user/session';
import { authAdmin } from '@/service/common/auth';

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { userId } = await authAdmin(req);
    // 删除该用户的所有 Redis session
    await delUserAllSession(userId);
  } catch {
    // 即使认证失败也清除 cookie
  }

  clearCookie(res);
  return res.status(200).json({ success: true });
}

export default NextAPI(handler);
