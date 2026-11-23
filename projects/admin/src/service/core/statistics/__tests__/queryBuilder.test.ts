/**
 * QueryBuilder 单元测试
 * 覆盖：时间范围条件、modelId 精确筛选、modelName/appName 模糊匹配与通配符转义
 */

import { QueryBuilder } from '@/service/core/statistics/queryBuilder';
import type { StatisticsQuery } from '@/service/core/statistics/statistics';

describe('QueryBuilder', () => {
  let builder: QueryBuilder;

  const baseFilters: StatisticsQuery = {
    startTime: '2026-01-01T00:00:00+08:00',
    endTime: '2026-01-31T23:59:59+08:00'
  };

  beforeAll(() => {
    builder = new QueryBuilder();
  });

  describe('buildWhereClause - 基础行为', () => {
    it('仅时间范围时 WHERE 只含时间条件，参数从 $1 开始', () => {
      const { clause, values } = builder.buildWhereClause(baseFilters);

      expect(clause).toContain('call_timestamp >= $1');
      expect(clause).toContain('call_timestamp <= $2');
      expect(clause).not.toContain('app_id');
      expect(clause).not.toContain('model_id');
      expect(values).toEqual([baseFilters.startTime, baseFilters.endTime]);
    });

    it('所有可选条件均不传时不改变 WHERE 基础结构', () => {
      const { clause, values } = builder.buildWhereClause({
        ...baseFilters,
        appId: undefined,
        appName: undefined,
        modelId: undefined,
        modelName: undefined,
        callStatus: undefined
      });

      const conditions = clause.replace('WHERE ', '').split(' AND ');
      expect(conditions).toHaveLength(2);
      expect(values).toHaveLength(2);
    });
  });

  describe('buildWhereClause - modelId 精确筛选', () => {
    it('生成 model_id = $n 精确条件', () => {
      const { clause, values } = builder.buildWhereClause({
        ...baseFilters,
        modelId: 'gpt-4o-mini'
      });

      expect(clause).toContain('model_id = $3');
      expect(values).toEqual([baseFilters.startTime, baseFilters.endTime, 'gpt-4o-mini']);
    });

    it('modelId 与其他条件组合时参数序号正确', () => {
      const { clause, values } = builder.buildWhereClause({
        ...baseFilters,
        appId: 'app123',
        modelId: 'model-a'
      });

      expect(clause).toContain('app_id = $3');
      expect(clause).toContain('model_id = $4');
      expect(values).toEqual([baseFilters.startTime, baseFilters.endTime, 'app123', 'model-a']);
    });
  });

  describe('buildWhereClause - modelName 模糊匹配', () => {
    it('生成 ILIKE 条件并用 % 包裹参数值', () => {
      const { clause, values } = builder.buildWhereClause({
        ...baseFilters,
        modelName: 'GPT'
      });

      expect(clause).toContain("model_name ILIKE $3 ESCAPE '\\'");
      expect(values[2]).toBe('%GPT%');
    });

    it('modelName 含 % 和 _ 时转义为字面匹配', () => {
      const { values } = builder.buildWhereClause({
        ...baseFilters,
        modelName: 'gpt_4%o'
      });

      expect(values[2]).toBe('%gpt\\_4\\%o%');
    });

    it('modelName 含反斜杠时同样转义', () => {
      const { values } = builder.buildWhereClause({
        ...baseFilters,
        modelName: 'a\\b'
      });

      expect(values[2]).toBe('%a\\\\b%');
    });
  });

  describe('buildWhereClause - appName 模糊匹配（既有行为不回归）', () => {
    it('生成 ILIKE 条件并转义通配符', () => {
      const { clause, values } = builder.buildWhereClause({
        ...baseFilters,
        appName: '客服_机器人'
      });

      expect(clause).toContain("app_name ILIKE $3 ESCAPE '\\'");
      expect(values[2]).toBe('%客服\\_机器人%');
    });
  });

  describe('buildStatisticsListQuery - 统计列表查询', () => {
    it('SELECT 与 GROUP BY 包含 model_id', () => {
      const { text } = builder.buildStatisticsListQuery(baseFilters);

      expect(text).toMatch(/SELECT[\s\S]*model_id,[\s\S]*model_name/);
      expect(text).toContain('GROUP BY app_id, app_name, model_id, model_name, usage_scenario');
    });

    it('分页参数追加在筛选参数之后', () => {
      const filters: StatisticsQuery = { ...baseFilters, pageNum: 3, pageSize: 50 };
      const { text, values } = builder.buildStatisticsListQuery(filters);

      expect(text).toContain('LIMIT $3 OFFSET $4');
      expect(values.slice(-2)).toEqual([50, 100]);
    });
  });

  describe('buildStatisticsListCountQuery - 总数查询', () => {
    it('子查询 GROUP BY 包含 model_id', () => {
      const { text } = builder.buildStatisticsListCountQuery(baseFilters);

      expect(text).toContain('GROUP BY app_id, model_id, model_name');
    });
  });
});
