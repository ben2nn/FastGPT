/**
 * 统计查询参数验证单元测试
 * 覆盖：appId/modelId 多值解析（逗号分隔/重复参数/混合语法）、空白取值与数量上限校验、
 * 时间区间校验、分页校验、既有校验不回归
 */

import {
  validateAndCleanQuery,
  validateTimeRange,
  MAX_ID_FILTER_VALUES
} from '@/service/core/statistics/validation';
import { StatisticsError, StatisticsErrorCode } from '@/service/core/statistics/statistics';

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

/**
 * 期望 validateAndCleanQuery 抛出指定错误码的 StatisticsError，
 * 可选校验消息细节（message + details.errors 拼接后包含子串）
 */
function expectQueryErrorCode(query: any, code: StatisticsErrorCode, substring?: string) {
  let thrown: unknown;
  try {
    validateAndCleanQuery(query);
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(StatisticsError);
  const err = thrown as StatisticsError;
  expect(err.code).toBe(code);
  if (substring !== undefined) {
    const allMessages = [err.message, ...((err.details?.errors as string[]) || [])].join('\n');
    expect(allMessages).toContain(substring);
  }
}

describe('validateAndCleanQuery', () => {
  const baseQuery = {
    startTime: '2026-01-01T00:00:00+08:00',
    endTime: '2026-01-31T23:59:59+08:00'
  };

  describe('modelId 校验', () => {
    it('合法 modelId 通过校验并归一化为数组', () => {
      const result = validateAndCleanQuery({ ...baseQuery, modelId: 'gpt-4o-mini' });
      expect(result.modelId).toEqual(['gpt-4o-mini']);
    });

    it('modelId 为空字符串时视同未传（与 appName 行为一致，不报错）', () => {
      const result = validateAndCleanQuery({ ...baseQuery, modelId: '' });
      expect(result.modelId).toBeUndefined();
    });

    it('modelId 仅空白字符时报 INVALID_FILTER_PARAM（消息保留「不能为空」）', () => {
      expectQueryErrorCode(
        { ...baseQuery, modelId: '   ' },
        StatisticsErrorCode.INVALID_FILTER_PARAM,
        '不能为空'
      );
    });

    it('不传 modelId 时结果中无该字段', () => {
      const result = validateAndCleanQuery(baseQuery);
      expect(result.modelId).toBeUndefined();
    });
  });

  describe('appId/modelId 多值解析', () => {
    it('appId 单值归一化为数组', () => {
      const result = validateAndCleanQuery({ ...baseQuery, appId: 'app123' });
      expect(result.appId).toEqual(['app123']);
    });

    it('逗号分隔的多值被拆分为数组', () => {
      const result = validateAndCleanQuery({ ...baseQuery, modelId: 'gpt-4o,gpt-4o-mini' });
      expect(result.modelId).toEqual(['gpt-4o', 'gpt-4o-mini']);
    });

    it('重复参数（数组输入）的多个取值被合并为数组', () => {
      const result = validateAndCleanQuery({ ...baseQuery, appId: ['app-a', 'app-b'] });
      expect(result.appId).toEqual(['app-a', 'app-b']);
    });

    it('混合语法（数组元素含逗号）被展开合并', () => {
      const result = validateAndCleanQuery({ ...baseQuery, appId: ['app-a,app-b', 'app-c'] });
      expect(result.appId).toEqual(['app-a', 'app-b', 'app-c']);
    });

    it('取值首尾空白被 trim（多值场景）', () => {
      const result = validateAndCleanQuery({ ...baseQuery, appId: ' abc , def ' });
      expect(result.appId).toEqual(['abc', 'def']);
    });

    it('去重并保持首次出现顺序', () => {
      const result = validateAndCleanQuery({ ...baseQuery, appId: 'a,b,a,c,b' });
      expect(result.appId).toEqual(['a', 'b', 'c']);
    });

    it('appId/modelId 空字符串均视同未传', () => {
      const result = validateAndCleanQuery({ ...baseQuery, appId: '', modelId: '' });
      expect(result.appId).toBeUndefined();
      expect(result.modelId).toBeUndefined();
    });

    it('逗号分隔中含空白片段（a,,b）报 INVALID_FILTER_PARAM', () => {
      expectQueryErrorCode(
        { ...baseQuery, appId: 'a,,b' },
        StatisticsErrorCode.INVALID_FILTER_PARAM,
        'appId'
      );
    });

    it('数组输入含空白取值报 INVALID_FILTER_PARAM', () => {
      expectQueryErrorCode(
        { ...baseQuery, appId: ['a', '  '] },
        StatisticsErrorCode.INVALID_FILTER_PARAM,
        '不能为空'
      );
    });

    it(`取值数量超过 ${MAX_ID_FILTER_VALUES} 报 INVALID_FILTER_PARAM（超限提示）`, () => {
      const ids = Array.from({ length: MAX_ID_FILTER_VALUES + 1 }, (_, i) => `app-${i}`);
      expectQueryErrorCode(
        { ...baseQuery, appId: ids.join(',') },
        StatisticsErrorCode.INVALID_FILTER_PARAM,
        '超过'
      );
    });

    it(`恰好 ${MAX_ID_FILTER_VALUES} 个取值通过`, () => {
      const ids = Array.from({ length: MAX_ID_FILTER_VALUES }, (_, i) => `app-${i}`);
      const result = validateAndCleanQuery({ ...baseQuery, appId: ids });
      expect(result.appId).toHaveLength(MAX_ID_FILTER_VALUES);
    });

    it('多值不影响其他筛选参数的解析', () => {
      const result = validateAndCleanQuery({
        ...baseQuery,
        appId: ['app-a', 'app-b'],
        appName: '客服',
        modelId: ['gpt-4o'],
        modelName: 'gpt',
        callStatus: 'success'
      });
      expect(result.appId).toEqual(['app-a', 'app-b']);
      expect(result.appName).toBe('客服');
      expect(result.modelId).toEqual(['gpt-4o']);
      expect(result.modelName).toBe('gpt');
      expect(result.callStatus).toBe('success');
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

      expect(result.appId).toEqual(['app123']);
      expect(result.appName).toBe('客服');
      expect(result.modelId).toEqual(['gpt-4o']);
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
