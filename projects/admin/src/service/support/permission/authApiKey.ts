/**
 * 对外 API Key 认证
 * 三方通过 Authorization: Bearer <key> 访问 /api/external/* 接口
 *
 * 安全约定：
 * - Key 无效（不存在）、已禁用、请求头缺失/格式错误，均抛出相同的
 *   ApiKeyAuthError（401 + UNAUTHORIZED），不泄露 Key 是否存在
 * - 认证命中后异步更新 last_used_at，不阻塞主流程
 */

import type { NextApiRequest } from 'next';
import { addLog } from '@fastgpt/service/common/system/log';
import { findUsableByKey, touchApiKeyLastUsed, extractKeyPrefix } from '@/service/support/apiKey';
import type { ApiKeyRecord } from '@/service/support/apiKey';

/** 认证失败统一错误（接口层捕获后以 401 输出，结构与其他错误响应一致） */
export class ApiKeyAuthError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message = 'UNAUTHORIZED: 无效的 API Key') {
    super(message);
    this.name = 'ApiKeyAuthError';
    this.statusCode = 401;
    this.code = 'UNAUTHORIZED';

    Object.setPrototypeOf(this, ApiKeyAuthError.prototype);
  }
}

/**
 * 从请求中解析 Bearer Key
 * @returns Key 明文；格式不符返回 null
 */
export function parseBearerKey(req: NextApiRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return null;
  }

  const key = match[1].trim();
  return key || null;
}

/**
 * 对外接口统一认证
 * @throws ApiKeyAuthError 当 Key 缺失、格式错误、不存在或已禁用时（统一 401）
 * @returns 认证通过的 Key 记录
 */
export async function authExternalApiKey(req: NextApiRequest): Promise<ApiKeyRecord> {
  const key = parseBearerKey(req);

  if (!key) {
    throw new ApiKeyAuthError();
  }

  const record = await findUsableByKey(key);

  if (!record) {
    // 与 Key 缺失抛出相同错误，不区分「不存在」与「已禁用」
    throw new ApiKeyAuthError();
  }

  // 异步更新最近使用时间，不阻塞响应
  touchApiKeyLastUsed(record.id).catch((error) => {
    addLog.warn('[ApiKeyAuth] 更新 last_used_at 失败', {
      keyPrefix: record.keyPrefix,
      error: error instanceof Error ? error.message : String(error)
    });
  });

  addLog.info('[ApiKeyAuth] 对外接口认证通过', {
    keyPrefix: extractKeyPrefix(key),
    keyId: record.id,
    url: req.url
  });

  return record;
}
