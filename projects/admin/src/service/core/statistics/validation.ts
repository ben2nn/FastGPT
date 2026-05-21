/**
 * 统计查询参数验证服务
 * 负责验证统计 API 的查询参数，确保数据的完整性和准确性
 */

import dayjs from 'dayjs';

import type { StatisticsQuery, TimeGranularity } from '@/service/core/statistics/statistics';
import { StatisticsError, StatisticsErrorCode } from '@/service/core/statistics/statistics';

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
  } else if (!dayjs(query.startTime).isValid()) {
    errors.push('startTime: 开始时间必须是有效的 ISO 8601 格式');
  }

  // 验证 endTime
  if (!query.endTime || typeof query.endTime !== 'string') {
    errors.push('endTime: 结束时间必须是有效的字符串');
  } else if (!dayjs(query.endTime).isValid()) {
    errors.push('endTime: 结束时间必须是有效的 ISO 8601 格式');
  }

  // 验证 appId
  if (query.appId !== undefined && (!query.appId || typeof query.appId !== 'string')) {
    errors.push('appId: 应用ID不能为空');
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
    const start = new Date(query.startTime);
    const end = new Date(query.endTime);
    if (start >= end) {
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
 * 3. 时间不能是未来时间
 *
 * @param startTime 开始时间（ISO 8601 格式）
 * @param endTime 结束时间（ISO 8601 格式）
 * @throws StatisticsError 如果验证失败
 */
export function validateTimeRange(startTime: string, endTime: string): void {
  const start = dayjs(startTime);
  const end = dayjs(endTime);
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

  // 验证时间不能是未来时间
  if (end.isAfter(now)) {
    throw new StatisticsError(StatisticsErrorCode.INVALID_TIME_RANGE, '结束时间不能是未来时间');
  }
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

  const start = dayjs(startTime);
  const end = dayjs(endTime);
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
      modelName: query.modelName ? String(query.modelName).trim() : undefined,
      callStatus: query.callStatus ? String(query.callStatus).trim() : undefined,
      pageNum: query.pageNum ? Number(query.pageNum) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined
    };

    // 2. 进行基本验证
    validateQuerySchema(cleanedQuery);

    // 3. 验证时间范围
    validateTimeRange(cleanedQuery.startTime, cleanedQuery.endTime);

    // 4. 验证分页参数
    const { pageNum, pageSize } = validatePagination(cleanedQuery.pageNum, cleanedQuery.pageSize);

    // 5. 返回清洗后的参数
    return {
      ...cleanedQuery,
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
