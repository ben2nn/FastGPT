/**
 * 统计功能 API 请求封装
 * 提供统计数据查询和导出的前端请求函数
 */

import { GET } from '@/web/common/api/request';
import type {
  StatisticsQuery,
  OverviewStatistics,
  AppStatisticsResponse,
  ModelStatisticsResponse,
  TrendStatisticsResponse,
  StatusStatisticsResponse,
  StatisticsListResponse,
  ExportFormat,
  ExportType
} from '@/service/core/statistics/statistics';

/**
 * 将查询参数归一化为 HTTP 查询串形态
 *
 * appId/modelId/modelCategory 在 StatisticsQuery 中为数组（多值筛选），HTTP 传输统一
 * 使用逗号分隔语法（`appId=a,b`）。数组直接交给 axios 默认序列化会产生 `appId[]=a`
 * 形式（键名带方括号），后端无法识别，故此处显式转换。
 * 单值数组转换后与既有线上格式完全一致（`['app123']` → `'app123'`）。
 */
function toHttpQuery(params: StatisticsQuery): Record<string, string | number | undefined> {
  return {
    ...params,
    appId: params.appId?.length ? params.appId.join(',') : undefined,
    modelId: params.modelId?.length ? params.modelId.join(',') : undefined,
    modelCategory: params.modelCategory?.length ? params.modelCategory.join(',') : undefined
  };
}

/**
 * 获取总览统计数据
 *
 * @param params 查询参数
 * @returns 总览统计数据
 *
 * @example
 * const data = await getOverviewStatistics({
 *   startTime: '2024-01-01T00:00:00Z',
 *   endTime: '2024-01-31T23:59:59Z',
 *   appId: 'app123'
 * });
 */
export const getOverviewStatistics = (params: StatisticsQuery): Promise<OverviewStatistics> => {
  return GET<OverviewStatistics>('/statistics/overview', toHttpQuery(params));
};

/**
 * 获取按应用统计数据
 *
 * @param params 查询参数（包含分页参数）
 * @returns 按应用统计数据（分页）
 *
 * @example
 * const data = await getAppStatistics({
 *   startTime: '2024-01-01T00:00:00Z',
 *   endTime: '2024-01-31T23:59:59Z',
 *   pageNum: 1,
 *   pageSize: 20
 * });
 */
export const getAppStatistics = (params: StatisticsQuery): Promise<AppStatisticsResponse> => {
  return GET<AppStatisticsResponse>('/statistics/by-app', toHttpQuery(params));
};

/**
 * 获取按模型统计数据
 *
 * @param params 查询参数（包含分页参数）
 * @returns 按模型统计数据（分页）
 *
 * @example
 * const data = await getModelStatistics({
 *   startTime: '2024-01-01T00:00:00Z',
 *   endTime: '2024-01-31T23:59:59Z',
 *   pageNum: 1,
 *   pageSize: 20
 * });
 */
export const getModelStatistics = (params: StatisticsQuery): Promise<ModelStatisticsResponse> => {
  return GET<ModelStatisticsResponse>('/statistics/by-model', toHttpQuery(params));
};

/**
 * 获取时间趋势统计数据
 *
 * @param params 查询参数（可选 granularity 参数）
 * @returns 时间趋势统计数据
 *
 * @example
 * const data = await getTrendStatistics({
 *   startTime: '2024-01-01T00:00:00Z',
 *   endTime: '2024-01-31T23:59:59Z',
 *   granularity: 'day'
 * });
 */
export const getTrendStatistics = (
  params: StatisticsQuery & { granularity?: 'day' | 'week' | 'month' }
): Promise<TrendStatisticsResponse> => {
  console.log('[getTrendStatistics] 请求参数:', params);
  return GET<TrendStatisticsResponse>('/statistics/trend', toHttpQuery(params))
    .then((data) => {
      console.log('[getTrendStatistics] 响应数据:', data);
      return data;
    })
    .catch((error) => {
      console.error('[getTrendStatistics] 请求失败:', error);
      throw error;
    });
};

/**
 * 获取状态统计数据
 *
 * @param params 查询参数
 * @returns 状态统计数据
 *
 * @example
 * const data = await getStatusStatistics({
 *   startTime: '2024-01-01T00:00:00Z',
 *   endTime: '2024-01-31T23:59:59Z'
 * });
 */
export const getStatusStatistics = (params: StatisticsQuery): Promise<StatusStatisticsResponse> => {
  return GET<StatusStatisticsResponse>('/statistics/status', toHttpQuery(params));
};

/**
 * 获取统计列表数据
 *
 * @param params 查询参数（包含分页参数）
 * @returns 统计列表数据（分页）
 *
 * @example
 * const data = await getStatisticsList({
 *   startTime: '2024-01-01T00:00:00Z',
 *   endTime: '2024-01-31T23:59:59Z',
 *   pageNum: 1,
 *   pageSize: 20
 * });
 */
export const getStatisticsList = (params: StatisticsQuery): Promise<StatisticsListResponse> => {
  return GET<StatisticsListResponse>('/statistics/list', toHttpQuery(params));
};

/**
 * 导出统计数据
 * 触发文件下载
 *
 * @param params 查询参数
 * @param format 导出格式（csv 或 json）
 * @param exportType 导出类型（overview、by-app、by-model、trend、status）
 *
 * @example
 * await exportStatistics(
 *   {
 *     startTime: '2024-01-01T00:00:00Z',
 *     endTime: '2024-01-31T23:59:59Z'
 *   },
 *   'csv',
 *   'overview'
 * );
 */
export const exportStatistics = async (
  params: StatisticsQuery,
  format: ExportFormat,
  exportType: ExportType
): Promise<void> => {
  try {
    // 构建查询参数
    const queryParams = new URLSearchParams();

    // 添加基础查询参数
    queryParams.append('startTime', params.startTime);
    queryParams.append('endTime', params.endTime);
    queryParams.append('format', format);
    queryParams.append('exportType', exportType);

    // 添加可选参数（appId/modelId/modelCategory 为多值数组，HTTP 使用逗号分隔语法）
    if (params.appId?.length) {
      queryParams.append('appId', params.appId.join(','));
    }
    if (params.modelId?.length) {
      queryParams.append('modelId', params.modelId.join(','));
    }
    if (params.modelCategory?.length) {
      queryParams.append('modelCategory', params.modelCategory.join(','));
    }
    if (params.modelName) {
      queryParams.append('modelName', params.modelName);
    }
    if (params.callStatus) {
      queryParams.append('callStatus', params.callStatus);
    }

    // 构建完整的 URL
    const url = `/api/statistics/export?${queryParams.toString()}`;

    // 创建隐藏的 a 标签触发下载
    const link = document.createElement('a');
    link.href = url;
    link.style.display = 'none';

    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `statistics-${exportType}-${timestamp}.${format}`;
    link.download = filename;

    // 触发下载
    document.body.appendChild(link);
    link.click();

    // 清理
    setTimeout(() => {
      document.body.removeChild(link);
    }, 100);
  } catch (error) {
    console.error('导出失败:', error);
    throw error;
  }
};
