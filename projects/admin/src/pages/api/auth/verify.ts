import { connectToDatabase } from '@/service/common/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { authJWT } from '@fastgpt/service/support/permission/controller';
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
  // 只允许 GET 请求
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    await connectToDatabase();

    // 从请求头获取 Token
    const authHeader = req.headers.authorization;
    const token = req.headers.token as string | undefined;

    let jwtToken: string | undefined;

    // 支持两种方式传递 Token:
    // 1. Authorization: Bearer <token>
    // 2. token: <token>
    if (authHeader && authHeader.startsWith('Bearer ')) {
      jwtToken = authHeader.substring(7);
    } else if (token) {
      jwtToken = token;
    }

    if (!jwtToken) {
      return res.status(401).json({
        success: false,
        error: 'Token 不存在'
      });
    }

    // 验证 Token
    let decoded;
    try {
      decoded = await authJWT(jwtToken);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Token 无效或已过期'
      });
    }

    // 查询用户信息 (JWT 中用户 ID 字段为 _id)
    const user = await MongoUser.findById(decoded._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }

    // 检查用户状态
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: '账户已被禁用'
      });
    }

    // 返回用户信息
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
    return res.status(500).json({
      success: false,
      error: '服务器错误，请稍后重试'
    });
  }
}

export default NextAPI(handler);
