/**
 * API Key 更新 API（管理端）
 * PUT /api/external/keys/update
 *
 * 功能：启用/禁用 Key 或修改名称（仅更新传入的字段）
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { updateApiKey } from '@/service/support/apiKey';
import type { ApiKeyRecord } from '@/service/support/apiKey';

export type ApiKeyUpdateBody = {
  id: string;
  enabled?: boolean;
  name?: string;
};

async function handler(req: ApiRequestProps<ApiKeyUpdateBody>, res: ApiResponseType<ApiKeyRecord>) {
  try {
    if (req.method !== 'PUT') {
      res.setHeader('Allow', ['PUT']);
      return res.status(405).json({
        code: 'METHOD_NOT_ALLOWED',
        message: '方法不允许，仅支持 PUT 请求'
      } as any);
    }

    await authAdmin(req);

    const id = String(req.body?.id || '').trim();
    if (!id) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: 'id 不能为空',
        details: { field: 'id' }
      } as any);
    }

    const updates: { enabled?: boolean; name?: string } = {};
    if (req.body?.enabled !== undefined) {
      updates.enabled = Boolean(req.body.enabled);
    }
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name || name.length > 100) {
        return res.status(400).json({
          code: 'INVALID_PARAMS',
          message: 'name 不能为空且长度不能超过 100 字符',
          details: { field: 'name', maxLength: 100 }
        } as any);
      }
      updates.name = name;
    }

    const record = await updateApiKey(id, updates);

    if (!record) {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: 'API Key 不存在',
        details: { id }
      } as any);
    }

    addLog.info('[ApiKeyUpdateAPI] 更新 API Key', { id, updates });

    return res.status(200).json(record);
  } catch (error) {
    addLog.warn('[ApiKeyUpdateAPI] 更新 API Key 失败', {
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: '未授权，需要管理员权限'
    } as any);
  }
}

export default NextAPI(handler);
