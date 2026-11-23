/**
 * API Key 删除 API（管理端）
 * DELETE /api/external/keys/delete
 *
 * 功能：删除对外 API Key（删除后立即失效）
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { deleteApiKey } from '@/service/support/apiKey';

export type ApiKeyDeleteBody = {
  id: string;
};

export type ApiKeyDeleteResponse = {
  success: boolean;
};

async function handler(
  req: ApiRequestProps<ApiKeyDeleteBody>,
  res: ApiResponseType<ApiKeyDeleteResponse>
) {
  try {
    if (req.method !== 'DELETE') {
      res.setHeader('Allow', ['DELETE']);
      return res.status(405).json({
        code: 'METHOD_NOT_ALLOWED',
        message: '方法不允许，仅支持 DELETE 请求'
      } as any);
    }

    await authAdmin(req);

    // 兼容 query（request 封装的 DELETE 将参数置于 query）与 body 两种传递方式
    const id = String(req.query?.id || req.body?.id || '').trim();
    if (!id) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: 'id 不能为空',
        details: { field: 'id' }
      } as any);
    }

    const deleted = await deleteApiKey(id);

    if (!deleted) {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: 'API Key 不存在',
        details: { id }
      } as any);
    }

    addLog.info('[ApiKeyDeleteAPI] 删除 API Key', { id });

    return res.status(200).json({ success: true });
  } catch (error) {
    addLog.warn('[ApiKeyDeleteAPI] 删除 API Key 失败', {
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: '未授权，需要管理员权限'
    } as any);
  }
}

export default NextAPI(handler);
