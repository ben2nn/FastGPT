/**
 * 统计服务行映射单元测试
 * 覆盖：列表/按模型统计返回行携带 modelCategory（含 DB 缺省值回退 chat）、
 *       modelCategory 筛选参数进入 SQL 参数
 * PostgreSQL 连接池全部 mock，不连接数据库
 */

jest.mock('@fastgpt/service/common/system/log', () => ({
  addLog: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() }
}));

const mockQuery = jest.fn();
jest.mock('@/service/common/postgres', () => ({
  getPostgresPool: () => ({
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    query: mockQuery
  })
}));

import { StatisticsService } from '@/service/core/statistics/statisticsService';

const filters = {
  startTime: '2026-01-01T00:00:00+08:00',
  endTime: '2026-01-31T23:59:59+08:00',
  pageNum: 1,
  pageSize: 20
};

/** 根据 SQL 文本区分列表查询与总数查询 */
function mockListQueries(listRows: any[], total = listRows.length) {
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('COUNT(*) as total') && text.includes('as subquery')) {
      return { rows: [{ total: String(total) }] };
    }
    return { rows: listRows };
  });
}

describe('StatisticsService 行映射', () => {
  let service: StatisticsService;

  beforeEach(async () => {
    mockQuery.mockReset();
    service = new StatisticsService();
    await service.initialize();
  });

  describe('getStatisticsList', () => {
    it('行数据携带 modelCategory', async () => {
      mockListQueries([
        {
          app_id: 'app1',
          app_name: '客服应用',
          model_id: 'text-embedding-3-large',
          model_name: 'text-embedding-3-large',
          model_category: 'embedding',
          usage_scenario: 'datasetSearchNode',
          call_count: '10',
          total_tokens: '1000',
          total_points: '0',
          total_duration: '12.5',
          avg_duration: '1.25',
          success_rate: '100',
          avg_tokens_per_call: '100'
        }
      ]);

      const result = await service.getStatisticsList(filters);

      expect(result.list).toHaveLength(1);
      expect(result.list[0].modelCategory).toBe('embedding');
      expect(result.list[0].usageScenario).toBe('datasetSearchNode');
    });

    it('DB 未返回 model_category 时回退为 chat（兼容存量行）', async () => {
      mockListQueries([
        {
          app_id: 'app1',
          app_name: '客服应用',
          model_id: 'gpt-4o',
          model_name: 'gpt-4o',
          usage_scenario: 'chatNode',
          call_count: '5',
          total_tokens: '500',
          total_points: '1',
          total_duration: '8',
          avg_duration: '1.6',
          success_rate: '100',
          avg_tokens_per_call: '100'
        }
      ]);

      const result = await service.getStatisticsList(filters);

      expect(result.list[0].modelCategory).toBe('chat');
    });

    it('modelCategory 多值筛选进入 SQL 参数', async () => {
      mockListQueries([]);

      await service.getStatisticsList({ ...filters, modelCategory: ['embedding', 'rerank'] });

      const listCall = mockQuery.mock.calls.find(
        ([text]: [string]) => !text.includes('as subquery')
      );
      expect(listCall?.[0]).toContain('model_category = ANY($3)');
      expect(listCall?.[1][2]).toEqual(['embedding', 'rerank']);
    });

    it('列表与总数 SQL 默认排除 unknown 模型数据', async () => {
      mockListQueries([]);

      await service.getStatisticsList(filters);

      const listCall = mockQuery.mock.calls.find(
        ([text]: [string]) => !text.includes('as subquery')
      );
      const countCall = mockQuery.mock.calls.find(([text]: [string]) =>
        text.includes('as subquery')
      );
      expect(listCall?.[0]).toContain("model_id <> 'unknown'");
      expect(countCall?.[0]).toContain("model_id <> 'unknown'");
    });
  });

  describe('getModelStatistics', () => {
    it('行数据携带 modelCategory', async () => {
      mockQuery.mockImplementation(async (text: string) => {
        if (text.includes('COUNT(DISTINCT model_id)')) {
          return { rows: [{ total: '1' }] };
        }
        return {
          rows: [
            {
              model_id: 'bge-reranker-v2',
              model_name: 'bge-reranker-v2',
              model_category: 'rerank',
              call_count: '3',
              total_tokens: '300',
              avg_tokens_per_call: '100'
            }
          ]
        };
      });

      const result = await service.getModelStatistics(filters);

      expect(result.list[0].modelCategory).toBe('rerank');
    });
  });
});
