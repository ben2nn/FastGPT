/**
 * QueryBuilder 单元测试
 * 覆盖：时间范围条件、appId/modelId 多值精确筛选（= ANY）、modelName/appName 模糊匹配与通配符转义
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

  describe('buildWhereClause - appId/modelId 多值精确筛选', () => {
    it('modelId 单值生成 model_id = ANY($n) 条件，参数为数组', () => {
      const { clause, values } = builder.buildWhereClause({
        ...baseFilters,
        modelId: ['gpt-4o-mini']
      });

      expect(clause).toContain('model_id = ANY($3)');
      expect(clause).not.toMatch(/model_id = \$3/);
      expect(values).toEqual([baseFilters.startTime, baseFilters.endTime, ['gpt-4o-mini']]);
    });

    it('modelId 多值生成 model_id = ANY($n) 条件，参数为完整数组', () => {
      const { clause, values } = builder.buildWhereClause({
        ...baseFilters,
        modelId: ['gpt-4o', 'gpt-4o-mini']
      });

      expect(clause).toContain('model_id = ANY($3)');
      expect(values).toEqual([
        baseFilters.startTime,
        baseFilters.endTime,
        ['gpt-4o', 'gpt-4o-mini']
      ]);
    });

    it('appId/modelId 多值组合时参数序号正确（每条件占 1 个序号）', () => {
      const { clause, values } = builder.buildWhereClause({
        ...baseFilters,
        appId: ['app-a', 'app-b'],
        modelId: ['model-a', 'model-b']
      });

      expect(clause).toContain('app_id = ANY($3)');
      expect(clause).toContain('model_id = ANY($4)');
      expect(values).toEqual([
        baseFilters.startTime,
        baseFilters.endTime,
        ['app-a', 'app-b'],
        ['model-a', 'model-b']
      ]);
    });

    it('多值与 appName/modelName/callStatus 组合时参数序号连续', () => {
      const { clause, values } = builder.buildWhereClause({
        ...baseFilters,
        appId: ['app-a'],
        appName: '客服',
        modelId: ['model-a', 'model-b'],
        modelName: 'gpt',
        callStatus: 'success'
      });

      expect(clause).toContain('app_id = ANY($3)');
      expect(clause).toContain("app_name ILIKE $4 ESCAPE '\\'");
      expect(clause).toContain('model_id = ANY($5)');
      expect(clause).toContain("model_name ILIKE $6 ESCAPE '\\'");
      expect(clause).toContain('call_status = $7');
      expect(values).toEqual([
        baseFilters.startTime,
        baseFilters.endTime,
        ['app-a'],
        '%客服%',
        ['model-a', 'model-b'],
        '%gpt%',
        'success'
      ]);
    });
  });

  describe('buildAppFilter / buildModelIdFilter - 直接构建', () => {
    it('buildAppFilter 多值生成 ANY 条件与单数组参数', () => {
      const result = builder.buildAppFilter(['app-a', 'app-b'], 1);
      expect(result.clause).toBe('app_id = ANY($1)');
      expect(result.values).toEqual([['app-a', 'app-b']]);
    });

    it('buildModelIdFilter 单值生成 ANY 条件，参数序号正确', () => {
      const result = builder.buildModelIdFilter(['model-a'], 3);
      expect(result.clause).toBe('model_id = ANY($3)');
      expect(result.values).toEqual([['model-a']]);
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
    it('SELECT 与 GROUP BY 包含 model_id 与 model_category', () => {
      const { text } = builder.buildStatisticsListQuery(baseFilters);

      expect(text).toMatch(/SELECT[\s\S]*model_id,[\s\S]*model_name/);
      expect(text).toContain('model_category');
      expect(text).toContain(
        'GROUP BY app_id, app_name, model_id, model_name, model_category, usage_scenario'
      );
    });

    it('分页参数追加在筛选参数之后', () => {
      const filters: StatisticsQuery = { ...baseFilters, pageNum: 3, pageSize: 50 };
      const { text, values } = builder.buildStatisticsListQuery(filters);

      expect(text).toContain('LIMIT $3 OFFSET $4');
      expect(values.slice(-2)).toEqual([50, 100]);
    });
  });

  describe('buildWhereClause - modelCategory 多值筛选', () => {
    it('单值生成 model_category = ANY($n) 条件，参数为数组', () => {
      const { clause, values } = builder.buildWhereClause({
        ...baseFilters,
        modelCategory: ['embedding']
      });

      expect(clause).toContain('model_category = ANY($3)');
      expect(values).toEqual([baseFilters.startTime, baseFilters.endTime, ['embedding']]);
    });

    it('多值生成 ANY 条件，参数为完整数组（参数内 OR）', () => {
      const { clause, values } = builder.buildWhereClause({
        ...baseFilters,
        modelCategory: ['chat', 'rerank']
      });

      expect(clause).toContain('model_category = ANY($3)');
      expect(values).toEqual([baseFilters.startTime, baseFilters.endTime, ['chat', 'rerank']]);
    });

    it('modelCategory 位于 modelName 之后、callStatus 之前，参数序号连续', () => {
      const { clause, values } = builder.buildWhereClause({
        ...baseFilters,
        modelId: ['model-a'],
        modelName: 'gpt',
        modelCategory: ['chat', 'embedding'],
        callStatus: 'success'
      });

      expect(clause).toContain('model_id = ANY($3)');
      expect(clause).toContain("model_name ILIKE $4 ESCAPE '\\'");
      expect(clause).toContain('model_category = ANY($5)');
      expect(clause).toContain('call_status = $6');
      expect(values).toEqual([
        baseFilters.startTime,
        baseFilters.endTime,
        ['model-a'],
        '%gpt%',
        ['chat', 'embedding'],
        'success'
      ]);
    });

    it('不传 modelCategory 时 SQL 与升级前一致（无该条件）', () => {
      const { clause } = builder.buildWhereClause(baseFilters);

      expect(clause).not.toContain('model_category');
    });

    it('buildModelCategoryFilter 直接构建生成 ANY 条件与单数组参数', () => {
      const result = builder.buildModelCategoryFilter(['rerank'], 1);

      expect(result.clause).toBe('model_category = ANY($1)');
      expect(result.values).toEqual([['rerank']]);
    });
  });

  describe('buildStatisticsListCountQuery - 总数查询', () => {
    it('子查询 GROUP BY 与列表查询完全一致（含 model_category 与 usage_scenario）', () => {
      const { text } = builder.buildStatisticsListCountQuery(baseFilters);

      expect(text).toContain(
        'GROUP BY app_id, app_name, model_id, model_name, model_category, usage_scenario'
      );
    });

    it('同一应用+模型存在多类别/多场景时 total 与列表行数不偏差（SQL 键一致）', () => {
      const listSql = builder.buildStatisticsListQuery(baseFilters).text;
      const countSql = builder.buildStatisticsListCountQuery(baseFilters).text;
      const groupBy =
        'GROUP BY app_id, app_name, model_id, model_name, model_category, usage_scenario';

      expect(listSql).toContain(groupBy);
      expect(countSql).toContain(groupBy);
    });
  });
});
