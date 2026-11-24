/**
 * 内部统计导出 API 单元测试
 * 覆盖：by-model 导出新增「模型类别」列（中文映射）、JSON 导出 filters 携带 modelCategory、
 *       非法类别取值 400 INVALID_FILTER_PARAM
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
    getModelStatistics: jest.fn()
  }
}));

import { authAdmin } from '@/service/support/permission/auth';
import { statisticsService } from '@/service/core/statistics/statisticsService';
import handler from '@/pages/api/statistics/export';

const mockAuthAdmin = authAdmin as jest.Mock;
const mockGetModelStatistics = statisticsService.getModelStatistics as jest.Mock;

function makeReq(query: Record<string, any>): any {
  return { method: 'GET', query, headers: {}, url: '/api/statistics/export', setHeader: jest.fn() };
}

function makeRes(): NextApiResponse & { json: jest.Mock; send: jest.Mock } {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis()
  };
  return res;
}

const baseQuery = {
  startTime: '2026-01-01T00:00:00+08:00',
  endTime: '2026-01-31T23:59:59+08:00',
  exportType: 'by-model'
};

const modelStats = {
  total: 2,
  list: [
    {
      modelId: 'bge-reranker-v2',
      modelName: 'bge-reranker-v2',
      modelCategory: 'rerank',
      callCount: 3,
      totalTokens: 300,
      avgTokensPerCall: 100
    },
    {
      modelId: 'text-embedding-3-large',
      modelName: 'text-embedding-3-large',
      modelCategory: 'embedding',
      callCount: 10,
      totalTokens: 1000,
      avgTokensPerCall: 100
    }
  ],
  pageNum: 1,
  pageSize: 10000
};

beforeEach(() => {
  mockAuthAdmin.mockReset();
  mockAuthAdmin.mockResolvedValue({ tmbId: 't1' });
  mockGetModelStatistics.mockReset();
});

describe('GET /api/statistics/export - 模型类别', () => {
  it('by-model CSV 表头含「模型类别」，行值为中文映射（重排/向量）', async () => {
    mockGetModelStatistics.mockResolvedValueOnce(modelStats);

    const res = makeRes();
    await handler(makeReq({ ...baseQuery, format: 'csv' }), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    const csv = res.send.mock.calls[0][0] as string;
    expect(csv).toContain('模型ID,模型名称,模型类别,调用次数,总Token数,平均每次调用Token数');
    expect(csv).toContain('bge-reranker-v2,bge-reranker-v2,重排,3,300,100.00');
    expect(csv).toContain('text-embedding-3-large,text-embedding-3-large,向量,10,1000,100.00');
  });

  it('modelCategory 多值筛选透传至服务，JSON 导出 filters 与行数据携带类别', async () => {
    mockGetModelStatistics.mockResolvedValueOnce({ ...modelStats, list: [modelStats.list[1]] });

    const res = makeRes();
    await handler(
      makeReq({ ...baseQuery, format: 'json', modelCategory: 'embedding,rerank' }),
      res
    );

    expect(mockGetModelStatistics).toHaveBeenCalledWith(
      expect.objectContaining({ modelCategory: ['embedding', 'rerank'] })
    );
    const json = JSON.parse(res.send.mock.calls[0][0] as string);
    expect(json.filters.modelCategory).toEqual(['embedding', 'rerank']);
    expect(json.data[0].modelCategory).toBe('embedding');
  });

  it('非法类别取值返回 400 与 INVALID_FILTER_PARAM', async () => {
    const res = makeRes();
    await handler(makeReq({ ...baseQuery, format: 'csv', modelCategory: 'voice' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_FILTER_PARAM' })
    );
    expect(mockGetModelStatistics).not.toHaveBeenCalled();
  });
});
