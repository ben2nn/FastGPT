import type { NextApiRequest } from 'next';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

/**
 * Admin 项目统一认证函数
 * 校验用户身份 + 管理员权限（isRoot）
 * 前端通过 fastgpt_token cookie 或 token header 传递 session key
 */
export async function authAdmin(req: NextApiRequest) {
  const result = await parseHeaderCert({ req, authToken: true });

  if (!result.isRoot) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  return result;
}
