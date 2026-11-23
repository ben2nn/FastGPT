/**
 * API Key 管理 API 单元测试
 * mock 认证与 apiKey 服务，验证管理员认证拦截、参数校验与响应结构
 */

import { NextApiResponse } from 'next';

jest.mock('@fastgpt/service/common/system/log', () => ({
  addLog: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() }
}));

jest.mock('@/service/middleware/entry', () => ({
  NextAPI: jest.fn((...handlers: any[]) => handlers[0])
}));

jest.mock('@/service/support/permission/auth', () => ({
  authAdmin: jest.fn()
}));

jest.mock('@/service/support/apiKey', () => ({
  createApiKey: jest.fn(),
  listApiKeys: jest.fn(),
  updateApiKey: jest.fn(),
  deleteApiKey: jest.fn()
}));

import { authAdmin } from '@/service/support/permission/auth';
import { createApiKey, listApiKeys, updateApiKey, deleteApiKey } from '@/service/support/apiKey';
import listHandler from '@/pages/api/external/keys/list';
import createHandler from '@/pages/api/external/keys/create';
import updateHandler from '@/pages/api/external/keys/update';
import deleteHandler from '@/pages/api/external/keys/delete';

const mockAuthAdmin = authAdmin as jest.Mock;
const mockCreate = createApiKey as jest.Mock;
const mockList = listApiKeys as jest.Mock;
const mockUpdate = updateApiKey as jest.Mock;
const mockDelete = deleteApiKey as jest.Mock;

function makeRes() {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
}

function rejectUnAuth() {
  mockAuthAdmin.mockRejectedValue(new Error('unAuthorization'));
}

beforeEach(() => {
  mockAuthAdmin.mockReset().mockResolvedValue({ isRoot: true });
  mockCreate.mockReset();
  mockList.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
});

describe('GET /api/external/keys/list', () => {
  it('非管理员 session 返回 401', async () => {
    rejectUnAuth();
    const res = makeRes();
    await listHandler({ method: 'GET', query: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('管理员请求返回分页列表', async () => {
    mockList.mockResolvedValueOnce({ total: 0, list: [], pageNum: 1, pageSize: 20 });
    const res = makeRes();
    await listHandler({ method: 'GET', query: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 0, list: [] }));
  });
});

describe('POST /api/external/keys/create', () => {
  it('非管理员 session 返回 401', async () => {
    rejectUnAuth();
    const res = makeRes();
    await createHandler({ method: 'POST', body: { name: 'x' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('缺 name 返回 400 与 INVALID_PARAMS', async () => {
    const res = makeRes();
    await createHandler({ method: 'POST', body: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_PARAMS' }));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('创建成功返回明文 key（一次性）', async () => {
    mockCreate.mockResolvedValueOnce({
      key: 'dek_fullkey',
      id: 'id-1',
      keyPrefix: 'dek_full...',
      name: '三方A',
      enabled: true,
      createdAt: new Date()
    });

    const res = makeRes();
    await createHandler({ method: 'POST', body: { name: '三方A' } } as any, res);

    expect(mockCreate).toHaveBeenCalledWith('三方A');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ key: 'dek_fullkey' }));
  });
});

describe('PUT /api/external/keys/update', () => {
  it('缺 id 返回 400', async () => {
    const res = makeRes();
    await updateHandler({ method: 'PUT', body: { enabled: false } } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('禁用 Key 成功后 enabled=false 且响应不含明文', async () => {
    mockUpdate.mockResolvedValueOnce({
      id: 'id-1',
      keyPrefix: 'dek_abc...',
      name: '三方A',
      enabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastUsedAt: null
    });

    const res = makeRes();
    await updateHandler({ method: 'PUT', body: { id: 'id-1', enabled: false } } as any, res);

    expect(mockUpdate).toHaveBeenCalledWith('id-1', { enabled: false });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.enabled).toBe(false);
    expect(payload.keyPrefix).toBe('dek_abc...');
    expect(payload.key).toBeUndefined();
    expect(payload.keyHash).toBeUndefined();
  });

  it('Key 不存在返回 404', async () => {
    mockUpdate.mockResolvedValueOnce(null);
    const res = makeRes();
    await updateHandler({ method: 'PUT', body: { id: 'missing', enabled: true } } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('DELETE /api/external/keys/delete', () => {
  it('删除成功返回 success=true', async () => {
    mockDelete.mockResolvedValueOnce(true);
    const res = makeRes();
    await deleteHandler({ method: 'DELETE', body: { id: 'id-1' } } as any, res);

    expect(mockDelete).toHaveBeenCalledWith('id-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('删除不存在的 Key 返回 404', async () => {
    mockDelete.mockResolvedValueOnce(false);
    const res = makeRes();
    await deleteHandler({ method: 'DELETE', body: { id: 'missing' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('非管理员 session 返回 401', async () => {
    rejectUnAuth();
    const res = makeRes();
    await deleteHandler({ method: 'DELETE', body: { id: 'id-1' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
