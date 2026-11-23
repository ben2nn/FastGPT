/**
 * 统计查询参数验证单元测试
 * 覆盖：modelId 校验与清洗、时间区间校验、分页校验、既有校验不回归
 */

import { validateAndCleanQuery, validateTimeRange } from '@/service/core/statistics/validation';
import { StatisticsError } from '@/service/core/statistics/statistics';

/**
 * 期望 validateAndCleanQuery 抛出 StatisticsError，
 * 且 details.errors 中包含指定子串（validateQuerySchema 的 message 为泛型，细节在 details.errors）
 */
function expectQueryError(query: any, substring: string) {
  let thrown: unknown;
  try {
    validateAndCleanQuery(query);
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(StatisticsError);
  const err = thrown as StatisticsError;
  const allMessages = [err.message, ...((err.details?.errors as string[]) || [])].join('\n');
  expect(allMessages).toContain(substring);
}

describe('validateAndCleanQuery', () => {
  const baseQuery = {
    startTime: '2026-01-01T00:00:00+08:00',
    endTime: '2026-01-31T23:59:59+08:00'
  };

  describe('modelId 校验', () => {
    it('合法 modelId 通过校验并保留在结果中', () => {
      const result = validateAndCleanQuery({ ...baseQuery, modelId: 'gpt-4o-mini' });
      expect(result.modelId).toBe('gpt-4o-mini');
    });

    it('modelId 为空字符串时视同未传（与 appName 行为一致，不报错）', () => {
      const result = validateAndCleanQuery({ ...baseQuery, modelId: '' });
      expect(result.modelId).toBeUndefined();
    });

    it('modelId 仅空白字符时报错（清洗 trim 后为空字符串）', () => {
      expectQueryError({ ...baseQuery, modelId: '   ' }, 'modelId: 模型ID不能为空');
    });

    it('不传 modelId 时结果中无该字段', () => {
      const result = validateAndCleanQuery(baseQuery);
      expect(result.modelId).toBeUndefined();
    });
  });

  describe('时间区间校验（既有行为不回归）', () => {
    it('startTime 晚于 endTime 时报错', () => {
      expectQueryError(
        {
          startTime: '2026-02-01T00:00:00+08:00',
          endTime: '2026-01-01T00:00:00+08:00'
        },
        '开始时间必须早于结束时间'
      );
    });

    it('时间区间恰好 365 天时不报错（边界内）', () => {
      expect(() =>
        validateAndCleanQuery({
          startTime: '2025-01-01T00:00:00+08:00',
          endTime: '2026-01-01T00:00:00+08:00'
        })
      ).not.toThrow();
    });

    it('时间区间超过 365 天时报错', () => {
      expect(() =>
        validateAndCleanQuery({
          startTime: '2025-01-01T00:00:00+08:00',
          endTime: '2026-02-05T00:00:00+08:00'
        })
      ).toThrow(/365/);
    });

    it('时间字符串清洗（去除首尾空白）后正常通过', () => {
      const result = validateAndCleanQuery({
        startTime: ' 2026-01-01T00:00:00+08:00 ',
        endTime: ' 2026-01-31T23:59:59+08:00 '
      });
      expect(result.startTime).toBe('2026-01-01T00:00:00+08:00');
    });
  });

  describe('分页校验（既有行为不回归）', () => {
    it('pageSize 超过 100 时报错', () => {
      expectQueryError({ ...baseQuery, pageSize: '200' }, 'pageSize');
    });

    it('pageNum/pageSize 缺省时默认 1/20', () => {
      const result = validateAndCleanQuery(baseQuery);
      expect(result.pageNum).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('字符串形式的分页参数被转换为数字', () => {
      const result = validateAndCleanQuery({ ...baseQuery, pageNum: '2', pageSize: '50' });
      expect(result.pageNum).toBe(2);
      expect(result.pageSize).toBe(50);
    });
  });

  describe('组合条件', () => {
    it('appId + appName + modelId + modelName 同时通过并全部保留', () => {
      const result = validateAndCleanQuery({
        ...baseQuery,
        appId: 'app123',
        appName: '客服',
        modelId: 'gpt-4o',
        modelName: 'gpt',
        callStatus: 'success'
      });

      expect(result.appId).toBe('app123');
      expect(result.appName).toBe('客服');
      expect(result.modelId).toBe('gpt-4o');
      expect(result.modelName).toBe('gpt');
      expect(result.callStatus).toBe('success');
    });
  });
});

describe('validateTimeRange', () => {
  it('开始时间在未来时报错', () => {
    expect(() =>
      validateTimeRange('2099-01-01T00:00:00+08:00', '2099-12-31T00:00:00+08:00')
    ).toThrow(/未来/);
  });

  it('非法时间字符串报错', () => {
    expect(() => validateTimeRange('not-a-date', '2026-01-01T00:00:00+08:00')).toThrow(/无效/);
  });
});
