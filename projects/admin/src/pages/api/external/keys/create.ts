/**
 * API Key 创建 API（管理端）
 * POST /api/external/keys/create
 *
 * 功能：创建对外 API Key，明文仅在本次响应中返回一次
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { createApiKey } from '@/service/support/apiKey';

export type ApiKeyCreateBody = {
  name: string;
};

export type ApiKeyCreateResponse = {
  key: string;
  id: string;
  keyPrefix: string;
  name: string;
  enabled: boolean;
  createdAt: Date;
};

async function handler(
  req: ApiRequestProps<ApiKeyCreateBody>,
  res: ApiResponseType<ApiKeyCreateResponse>
) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({
        code: 'METHOD_NOT_ALLOWED',
        message: '方法不允许，仅支持 POST 请求'
      } as any);
    }

    await authAdmin(req);

    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: 'name 不能为空',
        details: { field: 'name' }
      } as any);
    }
    if (name.length > 100) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: 'name 长度不能超过 100 字符',
        details: { field: 'name', maxLength: 100 }
      } as any);
    }

    const result = await createApiKey(name);

    addLog.info('[ApiKeyCreateAPI] 创建 API Key 成功', {
      id: result.id,
      keyPrefix: result.keyPrefix,
      name
    });

    return res.status(200).json({
      key: result.key,
      id: result.id,
      keyPrefix: result.keyPrefix,
      name: result.name,
      enabled: result.enabled,
      createdAt: result.createdAt
    });
  } catch (error) {
    addLog.warn('[ApiKeyCreateAPI] 创建 API Key 失败', {
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: '未授权，需要管理员权限'
    } as any);
  }
}

export default NextAPI(handler);
