import { MongoUser } from '@fastgpt/service/support/user/schema';
import { authAdmin } from '@/service/support/permission/auth';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';
import { NextAPI } from '@/service/middleware/entry';

type VerifyResponse = {
  success: boolean;
  user?: {
    _id: string;
    username: string;
    status: string;
  };
  error?: string;
};

async function handler(req: ApiRequestProps, res: ApiResponseType<VerifyResponse>) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    // 使用 Redis Session 认证（与 app 项目统一）
    const { userId } = await authAdmin(req);

    const user = await MongoUser.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, error: '账户已被禁用' });
    }

    return res.status(200).json({
      success: true,
      user: {
        _id: user._id.toString(),
        username: user.username,
        status: user.status
      }
    });
  } catch (error) {
    addLog.error('Token verification error:', error);
    return res.status(401).json({
      success: false,
      error: 'Token 无效或已过期'
    });
  }
}

export default NextAPI(handler);
