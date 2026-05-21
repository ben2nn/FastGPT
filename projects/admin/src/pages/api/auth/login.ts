import { connectToDatabase } from '@/service/common/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { createJWT } from '@fastgpt/service/support/permission/controller';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { addLog } from '@fastgpt/service/common/system/log';
import { NextAPI } from '@/service/middleware/entry';

type LoginRequestBody = {
  username: string;
  password: string;
};

type LoginResponse = {
  success: boolean;
  token?: string;
  user?: {
    _id: string;
    username: string;
    status: string;
  };
  error?: string;
};

async function handler(
  req: ApiRequestProps<LoginRequestBody>,
  res: ApiResponseType<LoginResponse>
) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    await connectToDatabase();

    const { username, password } = req.body;

    // 验证请求参数
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: '用户名和密码不能为空'
      });
    }

    // 检测用户是否存在
    const authCert = await MongoUser.findOne({ username }, 'status');

    if (!authCert) {
      return res.status(401).json({
        success: false,
        error: '用户名或密码错误'
      });
    }

    if (authCert.status === UserStatusEnum.forbidden) {
      return res.status(403).json({
        success: false,
        error: '账户已被禁用'
      });
    }

    // 使用用户名和已加密的密码查询用户
    // 前端已经使用 SHA-256 加密密码，直接与数据库中的加密密码比对
    const user = await MongoUser.findOne({
      username,
      password
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: '用户名或密码错误'
      });
    }

    // 获取用户详情和团队信息
    const userDetail = await getUserDetail({
      tmbId: user?.lastLoginTmbId,
      userId: user._id.toString()
    });

    // 更新最后登录的团队成员 ID
    MongoUser.findByIdAndUpdate(user._id, {
      lastLoginTmbId: userDetail.team.tmbId
    });

    // 生成 JWT Token
    const token = createJWT({
      ...userDetail,
      isRoot: username === 'root'
    });

    // 返回成功响应
    return res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id.toString(),
        username: user.username,
        status: user.status
      }
    });
  } catch (error) {
    addLog.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: '服务器错误，请稍后重试'
    });
  }
}

export default NextAPI(handler);
