/**
 * 内部统计列表 API 单元测试
 * 覆盖：modelCategory 多值参数透传至统计服务、非法/空白取值 400、既有参数不回归
 * mock NextAPI 包装、管理员认证与统计服务，直接驱动 handler
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

jest.mock('@/service/core/statistics/statisticsService', () => ({
  statisticsService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getStatisticsList: jest.fn()
  }
}));

import { authAdmin } from '@/service/support/permission/auth';
import { statisticsService } from '@/service/core/statistics/statisticsService';
import handler, { StatisticsListQueryParams } from '@/pages/api/statistics/list';

const mockAuthAdmin = authAdmin as jest.Mock;
const mockGetList = statisticsService.getStatisticsList as jest.Mock;

function makeReq(method: string, query: Record<string, any> = {}): any {
  return { method, query, headers: {}, url: '/api/statistics/list', setHeader: jest.fn() };
}

function makeRes(): NextApiResponse & { json: jest.Mock } {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
}

const validQuery: StatisticsListQueryParams = {
  startTime: '2026-01-01T00:00:00+08:00',
  endTime: '2026-01-31T23:59:59+08:00'
};

const successList = {
  total: 1,
  list: [
    {
      appId: 'app1',
      appName: '客服机器人',
      modelId: 'text-embedding-3-large',
      modelName: 'text-embedding-3-large',
      modelCategory: 'embedding',
      usageScenario: 'datasetSearchNode',
      callCount: 10,
      totalTokens: 1000,
      totalPoints: 0,
      totalDuration: 5,
      avgDuration: 0.5,
      successRate: 100,
      avgTokensPerCall: 100
    }
  ],
  pageNum: 1,
  pageSize: 20
};

beforeEach(() => {
  mockAuthAdmin.mockReset();
  mockAuthAdmin.mockResolvedValue({ tmbId: 't1' });
  mockGetList.mockReset();
});

describe('GET /api/statistics/list - modelCategory', () => {
  it('逗号分隔多值归一化后透传至统计服务', async () => {
    mockGetList.mockResolvedValueOnce(successList);

    const res = makeRes();
    await handler(makeReq('GET', { ...validQuery, modelCategory: 'chat,embedding' }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGetList).toHaveBeenCalledWith(
      expect.objectContaining({ modelCategory: ['chat', 'embedding'] })
    );
  });

  it('重复参数（数组取值）归一化去重', async () => {
    mockGetList.mockResolvedValueOnce(successList);

    const res = makeRes();
    await handler(
      makeReq('GET', { ...validQuery, modelCategory: ['rerank', 'chat', 'rerank'] }),
      res
    );

    expect(mockGetList).toHaveBeenCalledWith(
      expect.objectContaining({ modelCategory: ['rerank', 'chat'] })
    );
  });

  it('不传 modelCategory 时服务收到的参数不含该字段', async () => {
    mockGetList.mockResolvedValueOnce(successList);

    const res = makeRes();
    await handler(makeReq('GET', validQuery), res);

    const passed = mockGetList.mock.calls[0][0];
    expect(passed.modelCategory).toBeUndefined();
  });

  it('非法枚举取值返回 400 与 INVALID_FILTER_PARAM', async () => {
    const res = makeRes();
    await handler(makeReq('GET', { ...validQuery, modelCategory: 'voice' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_FILTER_PARAM' })
    );
    expect(mockGetList).not.toHaveBeenCalled();
  });

  it('空白取值返回 400 与 INVALID_FILTER_PARAM', async () => {
    const res = makeRes();
    await handler(makeReq('GET', { ...validQuery, modelCategory: 'chat,,rerank' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_FILTER_PARAM' })
    );
  });

  it('响应列表行携带 modelCategory', async () => {
    mockGetList.mockResolvedValueOnce(successList);

    const res = makeRes();
    await handler(makeReq('GET', { ...validQuery, modelCategory: 'embedding' }), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.list[0].modelCategory).toBe('embedding');
  });
});
