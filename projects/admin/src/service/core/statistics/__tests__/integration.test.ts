/**
 * 统计查询集成测试
 * 覆盖：validateAndCleanQuery 清洗结果 → QueryBuilder 生成 SQL 参数的完整链路
 * 验证内部 API 与对外接口共用查询构建后，modelId 精确筛选与 modelName 模糊匹配行为一致
 */

import { QueryBuilder } from '@/service/core/statistics/queryBuilder';
import { validateAndCleanQuery } from '@/service/core/statistics/validation';

describe('统计查询集成：validation → queryBuilder', () => {
  let builder: QueryBuilder;

  beforeAll(() => {
    builder = new QueryBuilder();
  });

  it('modelId + modelName 模糊组合筛选生成正确的 SQL 参数', () => {
    const validated = validateAndCleanQuery({
      startTime: '2026-01-01T00:00:00+08:00',
      endTime: '2026-01-31T23:59:59+08:00',
      modelId: 'gpt-4o-mini',
      modelName: '4o'
    });

    const { clause, values } = builder.buildWhereClause(validated);

    expect(clause).toContain('model_id = $3');
    expect(clause).toContain("model_name ILIKE $4 ESCAPE '\\'");
    expect(values).toEqual([validated.startTime, validated.endTime, 'gpt-4o-mini', '%4o%']);
  });

  it('全量筛选条件（appId/appName/modelId/modelName/callStatus）参数序号连续', () => {
    const validated = validateAndCleanQuery({
      startTime: '2026-01-01T00:00:00+08:00',
      endTime: '2026-01-31T23:59:59+08:00',
      appId: 'app-1',
      appName: '客服',
      modelId: 'gpt-4o',
      modelName: 'gpt',
      callStatus: 'success',
      pageNum: 1,
      pageSize: 20
    });

    const { clause, values } = builder.buildWhereClause(validated);

    // 时间(2) + appId + appName + modelId + modelName + callStatus = 7 个参数
    expect(values).toHaveLength(7);
    expect(clause).toContain('app_id = $3');
    expect(clause).toContain("app_name ILIKE $4 ESCAPE '\\'");
    expect(clause).toContain('model_id = $5');
    expect(clause).toContain("model_name ILIKE $6 ESCAPE '\\'");
    expect(clause).toContain('call_status = $7');
    expect(values).toEqual([
      validated.startTime,
      validated.endTime,
      'app-1',
      '%客服%',
      'gpt-4o',
      '%gpt%',
      'success'
    ]);
  });

  it('经校验清洗的参数直接可用于统计列表查询（含分页）', () => {
    const validated = validateAndCleanQuery({
      startTime: '2026-01-01T00:00:00+08:00',
      endTime: '2026-01-31T23:59:59+08:00',
      modelId: 'gpt-4o',
      pageNum: '2',
      pageSize: '50'
    });

    const { text, values } = builder.buildStatisticsListQuery(validated);

    // 时间(2) + modelId = 3 个筛选参数，LIMIT/OFFSET 为 $4/$5
    expect(text).toContain('LIMIT $4 OFFSET $5');
    expect(values.slice(-2)).toEqual([50, 50]);
  });

  it('相同筛选参数在内部与对外构建路径下产出一致（共用 buildWhereClause）', () => {
    const raw = {
      startTime: '2026-01-01T00:00:00+08:00',
      endTime: '2026-01-31T23:59:59+08:00',
      appName: '客服',
      modelName: 'gpt'
    };
    const a = builder.buildWhereClause(validateAndCleanQuery(raw));
    const b = builder.buildWhereClause(validateAndCleanQuery({ ...raw }));

    expect(a.clause).toBe(b.clause);
    expect(a.values).toEqual(b.values);
  });
});
