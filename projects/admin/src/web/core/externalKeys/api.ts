/**
 * API Key 管理 API 请求封装
 */

import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type { ApiKeyRecord } from '@/service/support/apiKey';

export type ApiKeyListResponse = {
  total: number;
  list: ApiKeyRecord[];
  pageNum: number;
  pageSize: number;
};

export type ApiKeyCreateResponse = {
  key: string;
  id: string;
  keyPrefix: string;
  name: string;
  enabled: boolean;
  createdAt: string;
};

/** 分页查询 Key 列表 */
export const getApiKeys = (pageNum: number, pageSize: number): Promise<ApiKeyListResponse> => {
  return GET<ApiKeyListResponse>('/external/keys/list', { pageNum, pageSize });
};

/** 创建 Key（明文仅在响应中出现一次） */
export const createApiKey = (name: string): Promise<ApiKeyCreateResponse> => {
  return POST<ApiKeyCreateResponse>('/external/keys/create', { name });
};

/** 启用/禁用或改名 */
export const updateApiKey = (
  id: string,
  updates: { enabled?: boolean; name?: string }
): Promise<ApiKeyRecord> => {
  return PUT<ApiKeyRecord>('/external/keys/update', { id, ...updates });
};

/** 删除 Key */
export const deleteApiKey = (id: string): Promise<{ success: boolean }> => {
  return DELETE<{ success: boolean }>('/external/keys/delete', { id });
};
