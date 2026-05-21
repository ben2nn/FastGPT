/**
 * 统计功能自定义 Hooks
 * 封装统计数据查询逻辑，使用 react-query 管理数据状态
 */

import type { UseQueryOptions} from '@tanstack/react-query';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

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
 *
 * @param filters 查询参数
 * @param options react-query 配置选项
 * @returns 查询结果
 */
export const useOverviewStatistics = (
  filters: StatisticsQuery,
  options?: Omit<UseQueryOptions<OverviewStatistics, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery<OverviewStatistics, Error>({
    queryKey: ['statistics', 'overview', filters],
    queryFn: () => getOverviewStatistics(filters),
    placeholderData: keepPreviousData,
    ...options
  });
};

/**
 * 使用按应用统计数据
 *
 * @param filters 查询参数
 * @param options react-query 配置选项
 * @returns 查询结果
 */
export const useAppStatistics = (
  filters: StatisticsQuery,
  options?: Omit<UseQueryOptions<AppStatisticsResponse, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery<AppStatisticsResponse, Error>({
    queryKey: ['statistics', 'by-app', filters],
    queryFn: () => getAppStatistics(filters),
    placeholderData: keepPreviousData,
    ...options
  });
};

/**
 * 使用按模型统计数据
 *
 * @param filters 查询参数
 * @param options react-query 配置选项
 * @returns 查询结果
 */
export const useModelStatistics = (
  filters: StatisticsQuery,
  options?: Omit<UseQueryOptions<ModelStatisticsResponse, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery<ModelStatisticsResponse, Error>({
    queryKey: ['statistics', 'by-model', filters],
    queryFn: () => getModelStatistics(filters),
    placeholderData: keepPreviousData,
    ...options
  });
};

/**
 * 使用时间趋势统计数据
 *
 * @param filters 查询参数
 * @param granularity 时间粒度
 * @param options react-query 配置选项
 * @returns 查询结果
 */
export const useTrendStatistics = (
  filters: StatisticsQuery,
  granularity: 'day' | 'week' | 'month' = 'day',
  options?: Omit<UseQueryOptions<TrendStatisticsResponse, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery<TrendStatisticsResponse, Error>({
    queryKey: ['statistics', 'trend', filters, granularity],
    queryFn: () => getTrendStatistics({ ...filters, granularity }),
    placeholderData: keepPreviousData,
    ...options
  });
};

/**
 * 使用状态统计数据
 *
 * @param filters 查询参数
 * @param options react-query 配置选项
 * @returns 查询结果
 */
export const useStatusStatistics = (
  filters: StatisticsQuery,
  options?: Omit<UseQueryOptions<StatusStatisticsResponse, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery<StatusStatisticsResponse, Error>({
    queryKey: ['statistics', 'status', filters],
    queryFn: () => getStatusStatistics(filters),
    placeholderData: keepPreviousData,
    ...options
  });
};

/**
 * 使用统计列表数据
 *
 * @param filters 查询参数
 * @param options react-query 配置选项
 * @returns 查询结果
 */
export const useStatisticsList = (
  filters: StatisticsQuery,
  options?: Omit<UseQueryOptions<StatisticsListResponse, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery<StatisticsListResponse, Error>({
    queryKey: ['statistics', 'list', filters],
    queryFn: () => getStatisticsList(filters),
    placeholderData: keepPreviousData,
    ...options
  });
};
