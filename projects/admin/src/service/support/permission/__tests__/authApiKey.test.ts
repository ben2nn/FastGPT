/**
 * 对外 API Key 认证单元测试（mock apiKey 服务与日志）
 * 覆盖：有效 Key 通过、缺失/格式错误的 Authorization 头、禁用与不存在 Key 抛相同错误
 */

jest.mock('@fastgpt/service/common/system/log', () => ({
  addLog: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() }
}));

jest.mock('@/service/support/apiKey', () => ({
  findUsableByKey: jest.fn(),
  touchApiKeyLastUsed: jest.fn().mockResolvedValue(undefined),
  extractKeyPrefix: jest.fn((key: string) => `${key.slice(0, 8)}...`)
}));

import { NextApiRequest } from 'next';
import { findUsableByKey } from '@/service/support/apiKey';
import {
  authExternalApiKey,
  parseBearerKey,
  ApiKeyAuthError
} from '@/service/support/permission/authApiKey';

const mockFindUsable = findUsableByKey as jest.Mock;

function makeReq(headers: Record<string, string | undefined> = {}): NextApiRequest {
  return { headers, url: '/api/external/statistics/list' } as unknown as NextApiRequest;
}

const validRecord = {
  id: 'key-id-1',
  keyPrefix: 'dek_abc...',
  name: '三方A',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastUsedAt: null
};

beforeEach(() => {
  mockFindUsable.mockReset();
});

describe('parseBearerKey', () => {
  it('解析标准 Bearer 头', () => {
    expect(parseBearerKey(makeReq({ authorization: 'Bearer dek_abc' }))).toBe('dek_abc');
  });

  it('兼容小写 bearer 与多余空格', () => {
    expect(parseBearerKey(makeReq({ authorization: 'bearer  dek_xyz  ' }))).toBe('dek_xyz');
  });

  it('缺失、非 Bearer、空 Key 时返回 null', () => {
    expect(parseBearerKey(makeReq({}))).toBeNull();
    expect(parseBearerKey(makeReq({ authorization: 'Token dek_abc' }))).toBeNull();
    expect(parseBearerKey(makeReq({ authorization: 'Bearer ' }))).toBeNull();
  });
});

describe('authExternalApiKey', () => {
  it('有效 Key 认证通过并返回 Key 记录', async () => {
    mockFindUsable.mockResolvedValueOnce(validRecord);

    const record = await authExternalApiKey(makeReq({ authorization: 'Bearer dek_valid' }));

    expect(record.id).toBe('key-id-1');
    expect(mockFindUsable).toHaveBeenCalledWith('dek_valid');
  });

  it('缺失 Authorization 头抛出 401 ApiKeyAuthError', async () => {
    await expect(authExternalApiKey(makeReq({}))).rejects.toThrow(ApiKeyAuthError);
    await expect(authExternalApiKey(makeReq({}))).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED'
    });
    expect(mockFindUsable).not.toHaveBeenCalled();
  });

  it('格式错误的 Authorization 头抛出 401（不触发 Key 查询）', async () => {
    await expect(authExternalApiKey(makeReq({ authorization: 'Token dek_abc' }))).rejects.toThrow(
      ApiKeyAuthError
    );
    expect(mockFindUsable).not.toHaveBeenCalled();
  });

  it('禁用的 Key 与不存在的 Key 抛出完全相同的错误对象', async () => {
    // 不存在
    mockFindUsable.mockResolvedValueOnce(null);
    let errNotFound: unknown;
    try {
      await authExternalApiKey(makeReq({ authorization: 'Bearer dek_missing' }));
    } catch (e) {
      errNotFound = e;
    }

    // 禁用（findUsableByKey 对禁用 Key 也返回 null，此处模拟同样路径）
    mockFindUsable.mockResolvedValueOnce(null);
    let errDisabled: unknown;
    try {
      await authExternalApiKey(makeReq({ authorization: 'Bearer dek_disabled' }));
    } catch (e) {
      errDisabled = e;
    }

    expect(errNotFound).toBeInstanceOf(ApiKeyAuthError);
    expect(errDisabled).toBeInstanceOf(ApiKeyAuthError);
    // 相同的错误消息与错误码（不泄露 Key 状态差异）
    expect((errNotFound as ApiKeyAuthError).message).toBe((errDisabled as ApiKeyAuthError).message);
    expect((errNotFound as ApiKeyAuthError).code).toBe((errDisabled as ApiKeyAuthError).code);
    expect((errNotFound as ApiKeyAuthError).statusCode).toBe(
      (errDisabled as ApiKeyAuthError).statusCode
    );
  });
});
