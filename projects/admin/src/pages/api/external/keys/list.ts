/**
 * API Key 列表 API（管理端）
 * GET /api/external/keys/list
 *
 * 功能：分页查询对外 API Key 列表（不含 Key 哈希与明文）
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { listApiKeys } from '@/service/support/apiKey';
import type { ApiKeyRecord } from '@/service/support/apiKey';

export type ApiKeyListQuery = {
  pageNum?: string;
  pageSize?: string;
};

export type ApiKeyListResponse = {
  total: number;
  list: ApiKeyRecord[];
  pageNum: number;
  pageSize: number;
};

async function handler(
  req: ApiRequestProps<{}, ApiKeyListQuery>,
  res: ApiResponseType<ApiKeyListResponse>
) {
  const startTime = Date.now();

  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({
        code: 'METHOD_NOT_ALLOWED',
        message: '方法不允许，仅支持 GET 请求'
      } as any);
    }

    await authAdmin(req);

    const pageNum = Math.max(parseInt(String(req.query.pageNum || '1'), 10) || 1, 1);
    const pageSizeRaw = parseInt(String(req.query.pageSize || '20'), 10) || 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 100);

    const result = await listApiKeys(pageNum, pageSize);

    addLog.info('[ApiKeyListAPI] 查询 Key 列表', {
      pageNum,
      pageSize,
      total: result.total,
      duration: `${Date.now() - startTime}ms`
    });

    return res.status(200).json(result);
  } catch (error) {
    // authAdmin 未授权
    addLog.warn('[ApiKeyListAPI] 查询 Key 列表失败', {
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: '未授权，需要管理员权限'
    } as any);
  }
}

export default NextAPI(handler);
