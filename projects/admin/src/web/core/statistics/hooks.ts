/**
 * 统计功能自定义 Hooks
 * 封装统计数据查询逻辑，使用 react-query 管理数据状态
 */

import { useQuery } from '@tanstack/react-query';

import {
  getOverviewStatistics,
  getAppStatistics,
  getModelStatistics,
  getTrendStatistics,
  getStatusStatistics,
  getStatisticsList
} from './api';

import type {
  StatisticsQuery,
  OverviewStatistics,
  AppStatisticsResponse,
  ModelStatisticsResponse,
  TrendStatisticsResponse,
  StatusStatisticsResponse,
  StatisticsListResponse
} from '@/service/core/statistics/statistics';

/**
 * 使用总览统计数据
 */
export const useOverviewStatistics = (
  filters: StatisticsQuery,
  options?: { onError?: (error: Error) => void }
) => {
  return useQuery<OverviewStatistics, Error>(
    ['statistics', 'overview', filters],
    () => getOverviewStatistics(filters),
    {
      placeholderData: () => undefined,
      ...options
    }
  );
};

/**
 * 使用按应用统计数据
 */
export const useAppStatistics = (
  filters: StatisticsQuery,
  options?: { onError?: (error: Error) => void }
) => {
  return useQuery<AppStatisticsResponse, Error>(
    ['statistics', 'by-app', filters],
    () => getAppStatistics(filters),
    {
      placeholderData: () => undefined,
      ...options
    }
  );
};

/**
 * 使用按模型统计数据
 */
export const useModelStatistics = (
  filters: StatisticsQuery,
  options?: { onError?: (error: Error) => void }
) => {
  return useQuery<ModelStatisticsResponse, Error>(
    ['statistics', 'by-model', filters],
    () => getModelStatistics(filters),
    {
      placeholderData: () => undefined,
      ...options
    }
  );
};

/**
 * 使用时间趋势统计数据
 */
export const useTrendStatistics = (
  filters: StatisticsQuery,
  granularity: 'day' | 'week' | 'month' = 'day',
  options?: { onError?: (error: Error) => void }
) => {
  return useQuery<TrendStatisticsResponse, Error>(
    ['statistics', 'trend', filters, granularity],
    () => getTrendStatistics({ ...filters, granularity }),
    {
      placeholderData: () => undefined,
      ...options
    }
  );
};

/**
 * 使用状态统计数据
 */
export const useStatusStatistics = (
  filters: StatisticsQuery,
  options?: { onError?: (error: Error) => void }
) => {
  return useQuery<StatusStatisticsResponse, Error>(
    ['statistics', 'status', filters],
    () => getStatusStatistics(filters),
    {
      placeholderData: () => undefined,
      ...options
    }
  );
};

/**
 * 使用统计列表数据
 */
export const useStatisticsList = (
  filters: StatisticsQuery,
  options?: { onError?: (error: Error) => void }
) => {
  return useQuery<StatisticsListResponse, Error>(
    ['statistics', 'list', filters],
    () => getStatisticsList(filters),
    {
      placeholderData: () => undefined,
      ...options
    }
  );
};
