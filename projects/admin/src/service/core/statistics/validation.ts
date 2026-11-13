/**
 * 统计查询参数验证服务
 * 负责验证统计 API 的查询参数，确保数据的完整性和准确性
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

import { DEFAULT_TIMEZONE } from '@/web/common/constants';
import type { StatisticsQuery, TimeGranularity } from '@/service/core/statistics/statistics';
import { StatisticsError, StatisticsErrorCode } from '@/service/core/statistics/statistics';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 允许的时钟漂移上限（毫秒）
 *
 * 前端传入的结束时间通常是「浏览器当前时间」，浏览器与服务器时钟不同步时，
 * 结束时间可能比服务器当前时间略晚。此时不应直接判定为非法请求，
 * 而是将结束时间收敛到服务器当前时间；只有明显超出合理范围的未来时间才报错。
 */
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

/** 匹配带时区偏移的时间字符串（Z 或 ±HH:mm / ±HHmm） */
const TIMEZONE_OFFSET_REGEX = /(z|[+-]\d{2}:?\d{2})$/i;

/**
 * 将时间字符串解析为绝对时刻
 *
 * - 带时区偏移（如 `2026-11-12T17:15:07+08:00`、`...Z`）：按其偏移解析
 * - 不带偏移（如 `2026-11-12T17:15:07`）：按业务时区（DEFAULT_TIMEZONE）解析，
 *   避免服务器时区（如容器内的 UTC）与业务时区不一致导致时间整体偏移
 */
export function parseTimeToDayjs(value: string): dayjs.Dayjs {
  const time = String(value).trim();
  if (TIMEZONE_OFFSET_REGEX.test(time)) {
    return dayjs(time);
  }
  // dayjs.tz 传入非法字符串时会直接抛异常，先做一次有效性校验
  const parsed = dayjs(time);
  if (!parsed.isValid()) {
    return parsed;
  }
  return dayjs.tz(time, DEFAULT_TIMEZONE);
}

/**
 * 验证统计查询参数的基本格式
 *
 * 验证规则：
 * - startTime: 必填，ISO 8601 格式的日期时间字符串
 * - endTime: 必填，ISO 8601 格式的日期时间字符串
 * - appId: 可选，非空字符串
 * - modelName: 可选，非空字符串
 * - callStatus: 可选，非空字符串
 * - pageNum: 可选，正整数，默认 1
 * - pageSize: 可选，正整数，范围 1-100，默认 20
 */
function validateQuerySchema(query: any): void {
  const errors: string[] = [];

  // 验证 startTime
  if (!query.startTime || typeof query.startTime !== 'string') {
    errors.push('startTime: 开始时间必须是有效的字符串');
  } else if (!parseTimeToDayjs(query.startTime).isValid()) {
    errors.push('startTime: 开始时间必须是有效的 ISO 8601 格式');
  }

  // 验证 endTime
  if (!query.endTime || typeof query.endTime !== 'string') {
    errors.push('endTime: 结束时间必须是有效的字符串');
  } else if (!parseTimeToDayjs(query.endTime).isValid()) {
    errors.push('endTime: 结束时间必须是有效的 ISO 8601 格式');
  }

  // 验证 appId
  if (query.appId !== undefined && (!query.appId || typeof query.appId !== 'string')) {
    errors.push('appId: 应用ID不能为空');
  }

  // 验证 appName
  if (query.appName !== undefined && (!query.appName || typeof query.appName !== 'string')) {
    errors.push('appName: 应用名称不能为空');
  }

  // 验证 modelName
  if (query.modelName !== undefined && (!query.modelName || typeof query.modelName !== 'string')) {
    errors.push('modelName: 模型名称不能为空');
  }

  // 验证 callStatus
  if (
    query.callStatus !== undefined &&
    (!query.callStatus || typeof query.callStatus !== 'string')
  ) {
    errors.push('callStatus: 调用状态不能为空');
  }

  // 验证 pageNum
  if (query.pageNum !== undefined) {
    if (!Number.isInteger(query.pageNum)) {
      errors.push('pageNum: 页码必须是整数');
    } else if (query.pageNum < 1) {
      errors.push('pageNum: 页码必须大于0');
    }
  }

  // 验证 pageSize
  if (query.pageSize !== undefined) {
    if (!Number.isInteger(query.pageSize)) {
      errors.push('pageSize: 每页数量必须是整数');
    } else if (query.pageSize < 1) {
      errors.push('pageSize: 每页数量必须大于0');
    } else if (query.pageSize > 100) {
      errors.push('pageSize: 每页数量不能超过100');
    }
  }

  // 验证时间范围
  if (query.startTime && query.endTime) {
    const start = parseTimeToDayjs(query.startTime);
    const end = parseTimeToDayjs(query.endTime);
    if (start.isValid() && end.isValid() && (start.isAfter(end) || start.isSame(end))) {
      errors.push('开始时间必须早于结束时间');
    }
  }

  if (errors.length > 0) {
    throw new StatisticsError(StatisticsErrorCode.INVALID_TIME_RANGE, '查询参数验证失败', {
      errors
    });
  }
}

/**
 * 验证时间范围的有效性和限制
 *
 * 验证规则：
 * 1. 开始时间必须早于结束时间
 * 2. 时间范围不能超过 365 天
 * 3. 开始时间不能是未来时间；结束时间若因时钟漂移略晚于当前时间，
 *    会收敛到当前时间（而不是直接报错），仅当明显超出合理范围时才报错
 *
 * 字符串处理约定（时区安全）：
 * - 带时区偏移的时间字符串按绝对时刻解析
 * - 不带偏移的时间字符串按业务时区（DEFAULT_TIMEZONE）解析
 * - 返回值统一为业务时区、带偏移的 ISO 8601 字符串
 *
 * @param startTime 开始时间（ISO 8601 格式）
 * @param endTime 结束时间（ISO 8601 格式）
 * @returns 归一化后的时间范围（业务时区，带偏移）
 * @throws StatisticsError 如果验证失败
 */
export function validateTimeRange(
  startTime: string,
  endTime: string
): { startTime: string; endTime: string } {
  const start = parseTimeToDayjs(startTime);
  const end = parseTimeToDayjs(endTime);
  const now = dayjs();

  // 验证日期格式
  if (!start.isValid()) {
    throw new StatisticsError(StatisticsErrorCode.INVALID_TIME_RANGE, '开始时间格式无效');
  }

  if (!end.isValid()) {
    throw new StatisticsError(StatisticsErrorCode.INVALID_TIME_RANGE, '结束时间格式无效');
  }

  // 验证开始时间必须早于结束时间
  if (start.isAfter(end) || start.isSame(end)) {
    throw new StatisticsError(StatisticsErrorCode.INVALID_TIME_RANGE, '开始时间必须早于结束时间');
  }

  // 验证时间范围不能超过 365 天
  const daysDiff = end.diff(start, 'day');
  if (daysDiff > 365) {
    throw new StatisticsError(StatisticsErrorCode.TIME_RANGE_TOO_LARGE, '时间范围不能超过 365 天', {
      daysDiff,
      maxDays: 365
    });
  }

  // 验证开始时间不能是未来时间
  if (start.isAfter(now)) {
    throw new StatisticsError(StatisticsErrorCode.INVALID_TIME_RANGE, '开始时间不能是未来时间', {
      startTime: start.format(),
      serverNow: now.format(),
      timezone: DEFAULT_TIMEZONE
    });
  }

  // 结束时间晚于当前时间：允许时钟漂移，收敛到当前时间；超出合理范围才报错
  let effectiveEnd = end;
  if (end.isAfter(now)) {
    if (end.diff(now) > MAX_CLOCK_SKEW_MS) {
      throw new StatisticsError(StatisticsErrorCode.INVALID_TIME_RANGE, '结束时间不能是未来时间', {
        endTime: end.format(),
        serverNow: now.format(),
        timezone: DEFAULT_TIMEZONE
      });
    }
    effectiveEnd = now;
  }

  // 收敛后再次确认时间范围有效
  if (!start.isBefore(effectiveEnd)) {
    throw new StatisticsError(StatisticsErrorCode.INVALID_TIME_RANGE, '开始时间必须早于结束时间');
  }

  return {
    startTime: start.tz(DEFAULT_TIMEZONE).format(),
    endTime: effectiveEnd.tz(DEFAULT_TIMEZONE).format()
  };
}

/**
 * 验证分页参数
 *
 * 验证规则：
 * 1. pageNum 必须是正整数
 * 2. pageSize 必须是正整数，范围 1-100
 * 3. 如果未提供，使用默认值（pageNum=1, pageSize=20）
 *
 * @param pageNum 页码
 * @param pageSize 每页数量
 * @returns 验证后的分页参数
 * @throws StatisticsError 如果验证失败
 */
export function validatePagination(
  pageNum?: number,
  pageSize?: number
): { pageNum: number; pageSize: number } {
  // 设置默认值
  const validPageNum = pageNum ?? 1;
  const validPageSize = pageSize ?? 20;

  // 验证 pageNum
  if (!Number.isInteger(validPageNum) || validPageNum < 1) {
    throw new StatisticsError(StatisticsErrorCode.INVALID_PAGINATION, '页码必须是大于0的整数', {
      pageNum: validPageNum
    });
  }

  // 验证 pageSize
  if (!Number.isInteger(validPageSize) || validPageSize < 1 || validPageSize > 100) {
    throw new StatisticsError(
      StatisticsErrorCode.INVALID_PAGINATION,
      '每页数量必须是1-100之间的整数',
      { pageSize: validPageSize }
    );
  }

  return {
    pageNum: validPageNum,
    pageSize: validPageSize
  };
}

/**
 * 根据时间范围自动计算时间粒度
 *
 * 计算规则：
 * - 时间范围 ≤ 31 天: 按天聚合
 * - 31 天 < 时间范围 ≤ 180 天: 按周聚合
 * - 时间范围 > 180 天: 按月聚合
 *
 * @param startTime 开始时间（ISO 8601 格式）
 * @param endTime 结束时间（ISO 8601 格式）
 * @param explicitGranularity 显式指定的粒度（可选）
 * @returns 时间粒度
 */
export function calculateGranularity(
  startTime: string,
  endTime: string,
  explicitGranularity?: TimeGranularity
): TimeGranularity {
  // 如果显式指定了粒度，直接返回
  if (explicitGranularity) {
    return explicitGranularity;
  }

  const start = parseTimeToDayjs(startTime);
  const end = parseTimeToDayjs(endTime);
  const daysDiff = end.diff(start, 'day');

  // 根据时间范围自动计算粒度
  if (daysDiff <= 31) {
    return 'day';
  } else if (daysDiff <= 180) {
    return 'week';
  } else {
    return 'month';
  }
}

/**
 * 验证并清洗统计查询参数
 *
 * 这是一个综合验证函数，会执行以下操作：
 * 1. 验证基本格式
 * 2. 验证时间范围的有效性和限制
 * 3. 验证分页参数
 * 4. 清洗和标准化参数
 *
 * @param query 原始查询参数
 * @returns 验证并清洗后的查询参数
 * @throws StatisticsError 如果验证失败
 */
export function validateAndCleanQuery(query: any): StatisticsQuery {
  try {
    // 1. 数据类型转换
    const cleanedQuery = {
      startTime: String(query.startTime || '').trim(),
      endTime: String(query.endTime || '').trim(),
      appId: query.appId ? String(query.appId).trim() : undefined,
      appName: query.appName ? String(query.appName).trim() : undefined,
      modelName: query.modelName ? String(query.modelName).trim() : undefined,
      callStatus: query.callStatus ? String(query.callStatus).trim() : undefined,
      pageNum: query.pageNum ? Number(query.pageNum) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined
    };

    // 2. 进行基本验证
    validateQuerySchema(cleanedQuery);

    // 3. 验证时间范围（返回业务时区、带偏移的归一化时间）
    const { startTime, endTime } = validateTimeRange(cleanedQuery.startTime, cleanedQuery.endTime);

    // 4. 验证分页参数
    const { pageNum, pageSize } = validatePagination(cleanedQuery.pageNum, cleanedQuery.pageSize);

    // 5. 返回清洗后的参数
    return {
      ...cleanedQuery,
      startTime,
      endTime,
      pageNum,
      pageSize
    };
  } catch (error) {
    // 如果是 StatisticsError，直接抛出
    if (error instanceof StatisticsError) {
      throw error;
    }

    // 其他未知错误
    throw new StatisticsError(StatisticsErrorCode.INVALID_TIME_RANGE, '查询参数验证失败', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
