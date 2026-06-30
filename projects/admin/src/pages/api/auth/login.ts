import { MongoUser } from '@fastgpt/service/support/user/schema';
import { createUserSession } from '@fastgpt/service/support/user/session';
import { setCookie } from '@fastgpt/service/support/permission/auth/common';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { addLog } from '@fastgpt/service/common/system/log';
import { NextAPI } from '@/service/middleware/entry';
import requestIp from 'request-ip';

type LoginRequestBody = {
  username: string;
  password: string;
};

type LoginResponse = {
  success: boolean;
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

    // 生成 Redis Session（与 app 项目统一）
    const sessionToken = await createUserSession({
      userId: user._id.toString(),
      teamId: userDetail.team.teamId,
      tmbId: userDetail.team.tmbId,
      isRoot: username === 'root',
      ip: requestIp.getClientIp(req)
    });

    // 通过 HttpOnly Cookie 返回 session token（与 app 项目一致）
    setCookie(res, sessionToken);

    // 返回成功响应（不再返回 token，前端通过 cookie 携带）
    return res.status(200).json({
      success: true,
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
