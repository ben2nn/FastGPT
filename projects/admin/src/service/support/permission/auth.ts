import type { NextApiRequest } from 'next';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';

/**
 * Admin 项目统一认证函数
 * 与 app 项目共享 Redis Session 认证体系（authCert）
 * 前端通过 fastgpt_token cookie 或 token header 传递 session key
 */
export async function authAdmin(req: NextApiRequest) {
  return parseHeaderCert({ req, authToken: true });
}
