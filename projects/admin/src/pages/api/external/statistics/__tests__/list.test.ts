/**
 * 对外统计列表 API 单元测试
 * mock NextAPI 包装、认证与统计服务，直接驱动 handler 验证状态码与响应结构
 * 覆盖：认证、参数校验（时间/分页/多值 ID）、方法限制、错误不泄露、响应结构
 */

import { NextApiResponse } from 'next';

jest.mock('@fastgpt/service/common/system/log', () => ({
  addLog: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() }
}));

// 让 NextAPI 直接透传 handler，便于单测驱动
jest.mock('@/service/middleware/entry', () => ({
  NextAPI: jest.fn((...handlers: any[]) => handlers[0])
}));

jest.mock('@/service/support/permission/authApiKey', () => ({
  authExternalApiKey: jest.fn(),
  ApiKeyAuthError: class ApiKeyAuthError extends Error {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    constructor(message = 'UNAUTHORIZED: 无效的 API Key') {
      super(message);
      this.name = 'ApiKeyAuthError';
    }
  }
}));

jest.mock('@/service/core/statistics/statisticsService', () => ({
  statisticsService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getStatisticsList: jest.fn()
  }
}));

import { authExternalApiKey, ApiKeyAuthError } from '@/service/support/permission/authApiKey';
import { statisticsService } from '@/service/core/statistics/statisticsService';
import { StatisticsError, StatisticsErrorCode } from '@/service/core/statistics/statistics';
import handler, { ExternalStatisticsListQueryParams } from '@/pages/api/external/statistics/list';

const mockAuth = authExternalApiKey as jest.Mock;
const mockGetList = statisticsService.getStatisticsList as jest.Mock;

function makeReq(
  method: string,
  query: Record<string, any> = {},
  headers: Record<string, string> = {}
): any {
  return { method, query, headers, url: '/api/external/statistics/list', setHeader: jest.fn() };
}

function makeRes(): NextApiResponse & { json: jest.Mock } {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
}

const validQuery: ExternalStatisticsListQueryParams = {
  startTime: '2026-01-01T00:00:00+08:00',
  endTime: '2026-01-31T23:59:59+08:00'
};

const successList = {
  total: 2,
  list: [
    {
      appId: 'app1',
      appName: '客服机器人',
      modelId: 'gpt-4o',
      modelName: 'gpt-4o',
      usageScenario: 'chatNode',
      callCount: 10,
      totalTokens: 1000,
      totalPoints: 5,
      totalDuration: 20,
      avgDuration: 2,
      successRate: 100,
      avgTokensPerCall: 100
    }
  ],
  pageNum: 1,
  pageSize: 20
};

beforeEach(() => {
  mockAuth.mockReset();
  mockGetList.mockReset();
});

describe('GET /api/external/statistics/list', () => {
  it('无 Authorization 头时返回 401 与 UNAUTHORIZED', async () => {
    mockAuth.mockImplementation(() => {
      throw new ApiKeyAuthError();
    });

    const res = makeRes();
    await handler(makeReq('GET', validQuery), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }));
    expect(mockGetList).not.toHaveBeenCalled();
  });

  it('非法时间区间返回 400 与 INVALID_TIME_RANGE', async () => {
    mockAuth.mockResolvedValue({ id: 'k1', keyPrefix: 'dek_abc...' });

    const res = makeRes();
    await handler(
      makeReq('GET', {
        startTime: '2026-02-01T00:00:00+08:00',
        endTime: '2026-01-01T00:00:00+08:00'
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_TIME_RANGE' }));
    expect(mockGetList).not.toHaveBeenCalled();
  });

  it('pageSize=200 返回 400 与 INVALID_PAGINATION', async () => {
    mockAuth.mockResolvedValue({ id: 'k1', keyPrefix: 'dek_abc...' });

    const res = makeRes();
    await handler(makeReq('GET', { ...validQuery, pageSize: '200' } as any), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_PAGINATION' }));
  });

  it('POST 请求返回 405 METHOD_NOT_ALLOWED', async () => {
    const res = makeRes();
    await handler(makeReq('POST'), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'METHOD_NOT_ALLOWED' }));
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('查询超时返回 504 与 QUERY_TIMEOUT', async () => {
    mockAuth.mockResolvedValue({ id: 'k1', keyPrefix: 'dek_abc...' });
    mockGetList.mockRejectedValueOnce(
      new StatisticsError(
        StatisticsErrorCode.QUERY_TIMEOUT,
        '查询超时，请缩小时间范围或添加更多筛选条件'
      )
    );

    const res = makeRes();
    await handler(makeReq('GET', validQuery), res);

    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: StatisticsErrorCode.QUERY_TIMEOUT })
    );
  });

  it('正常请求返回 200 且响应含 total/list/pageNum/pageSize', async () => {
    mockAuth.mockResolvedValue({ id: 'k1', keyPrefix: 'dek_abc...' });
    mockGetList.mockResolvedValueOnce(successList);

    const res = makeRes();
    await handler(makeReq('GET', validQuery), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 2,
        pageNum: 1,
        pageSize: 20,
        list: expect.arrayContaining([
          expect.objectContaining({
            appId: 'app1',
            modelId: 'gpt-4o',
            modelName: 'gpt-4o'
          })
        ])
      })
    );
    // 传入统计服务的查询为清洗后的参数
    expect(mockGetList).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: validQuery.startTime,
        endTime: validQuery.endTime
      })
    );
  });

  it('统计服务未知错误返回 500 与 DATABASE_ERROR，不泄露内部细节', async () => {
    mockAuth.mockResolvedValue({ id: 'k1', keyPrefix: 'dek_abc...' });
    mockGetList.mockRejectedValueOnce(new Error('relation "xxx" does not exist'));

    const res = makeRes();
    await handler(makeReq('GET', validQuery), res);

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe('DATABASE_ERROR');
    expect(JSON.stringify(payload)).not.toContain('relation');
    expect(JSON.stringify(payload)).not.toContain('does not exist');
  });

  describe('appId/modelId 多值筛选', () => {
    const authKey = { id: 'k1', keyPrefix: 'dek_abc...' };

    it('appId 逗号分隔多值返回 200 且筛选参数归一化为数组', async () => {
      mockAuth.mockResolvedValue(authKey);
      mockGetList.mockResolvedValueOnce(successList);

      const res = makeRes();
      await handler(makeReq('GET', { ...validQuery, appId: 'appA,appB' }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockGetList).toHaveBeenCalledWith(
        expect.objectContaining({ appId: ['appA', 'appB'] })
      );
    });

    it('modelId 逗号分隔多值返回 200 且筛选参数归一化为数组', async () => {
      mockAuth.mockResolvedValue(authKey);
      mockGetList.mockResolvedValueOnce(successList);

      const res = makeRes();
      await handler(makeReq('GET', { ...validQuery, modelId: 'gpt-4o,gpt-4o-mini' }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockGetList).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: ['gpt-4o', 'gpt-4o-mini'] })
      );
    });

    it('重复参数（数组取值）返回 200 且归一化去重', async () => {
      mockAuth.mockResolvedValue(authKey);
      mockGetList.mockResolvedValueOnce(successList);

      const res = makeRes();
      // HTTP 层重复参数在 Next.js 中解析为数组
      await handler(makeReq('GET', { ...validQuery, appId: ['appA', 'appB', 'appA'] }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockGetList).toHaveBeenCalledWith(
        expect.objectContaining({ appId: ['appA', 'appB'] })
      );
    });

    it('单值 appId 行为不变（归一化为单元素数组）', async () => {
      mockAuth.mockResolvedValue(authKey);
      mockGetList.mockResolvedValueOnce(successList);

      const res = makeRes();
      await handler(makeReq('GET', { ...validQuery, appId: 'appA' }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockGetList).toHaveBeenCalledWith(expect.objectContaining({ appId: ['appA'] }));
    });

    it('appId 含空白取值返回 400 与 INVALID_FILTER_PARAM', async () => {
      mockAuth.mockResolvedValue(authKey);

      const res = makeRes();
      await handler(makeReq('GET', { ...validQuery, appId: 'appA,,appB' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'INVALID_FILTER_PARAM' })
      );
      expect(mockGetList).not.toHaveBeenCalled();
    });

    it('appId 超过 50 个取值返回 400 与 INVALID_FILTER_PARAM', async () => {
      mockAuth.mockResolvedValue(authKey);

      const ids = Array.from({ length: 51 }, (_, i) => `app-${i}`);
      const res = makeRes();
      await handler(makeReq('GET', { ...validQuery, appId: ids.join(',') }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'INVALID_FILTER_PARAM' })
      );
      expect(mockGetList).not.toHaveBeenCalled();
    });

    it('多值与其他筛选条件组合返回 200（参数内 OR、参数间 AND）', async () => {
      mockAuth.mockResolvedValue(authKey);
      mockGetList.mockResolvedValueOnce(successList);

      const res = makeRes();
      await handler(
        makeReq('GET', {
          ...validQuery,
          appId: 'appA,appB',
          modelId: 'gpt-4o,gpt-4o-mini',
          appName: '客服'
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockGetList).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: ['appA', 'appB'],
          modelId: ['gpt-4o', 'gpt-4o-mini'],
          appName: '客服'
        })
      );
    });
  });
});
