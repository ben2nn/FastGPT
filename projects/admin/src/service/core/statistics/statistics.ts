// ==================== 统计查询参数类型 ====================

/**
 * 统计查询参数
 */
export interface StatisticsQuery {
  startTime: string; // ISO 8601 格式
  endTime: string; // ISO 8601 格式
  appId?: string; // 可选的应用ID筛选
  appName?: string; // 可选的应用名称筛选
  modelName?: string; // 可选的模型筛选
  callStatus?: string; // 可选的状态筛选
  pageNum?: number; // 分页页码
  pageSize?: number; // 每页数量
}

// ==================== 总览统计类型 ====================

/**
 * 总览统计响应
 */
export interface OverviewStatistics {
  totalCalls: number; // 总调用次数
  totalTokens: number; // 总 Token 数
  totalPoints: number; // 总积分消耗
  totalDuration: number; // 总耗时（秒）
  avgDuration: number; // 平均每次调用耗时（秒）
  successRate: number; // 成功率（百分比）
  avgTokensPerCall: number; // 平均每次调用的 Token 数
  timeRange: {
    start: string;
    end: string;
  };
}

// ==================== 按应用统计类型 ====================

/**
 * 按应用统计项
 */
export interface AppStatistics {
  appId: string;
  appName: string;
  callCount: number;
  totalTokens: number;
  totalPoints: number;
  lastCallTime: string;
}

/**
 * 按应用统计响应
 */
export interface AppStatisticsResponse {
  total: number;
  list: AppStatistics[];
  pageNum: number;
  pageSize: number;
}

// ==================== 按模型统计类型 ====================

/**
 * 按模型统计项
 */
export interface ModelStatistics {
  modelId: string;
  modelName: string;
  callCount: number;
  totalTokens: number;
  avgTokensPerCall: number;
}

/**
 * 按模型统计响应
 */
export interface ModelStatisticsResponse {
  total: number;
  list: ModelStatistics[];
  pageNum: number;
  pageSize: number;
}

// ==================== 时间趋势统计类型 ====================

/**
 * 时间粒度
 */
export type TimeGranularity = 'day' | 'week' | 'month';

/**
 * 时间趋势数据点
 */
export interface TrendDataPoint {
  timestamp: string; // 时间点
  callCount: number; // 调用次数
  totalTokens: number; // Token 数
  totalPoints: number; // 积分消耗
}

/**
 * 时间趋势响应
 */
export interface TrendStatisticsResponse {
  granularity: TimeGranularity;
  items: TrendDataPoint[]; // 改为 items 避免与 checkRes 的 data 字段冲突
}

// ==================== 状态统计类型 ====================

/**
 * 状态统计项
 */
export interface StatusStatistics {
  status: string;
  count: number;
  percentage: number; // 占比（百分比）
}

/**
 * 状态统计响应
 */
export interface StatusStatisticsResponse {
  total: number;
  successRate: number;
  hasWarning: boolean; // 失败率是否超过 5%
  distribution: StatusStatistics[];
}

// ==================== 统计列表类型 ====================

/**
 * 统计列表项
 */
export interface StatisticsListItem {
  appId: string;
  appName: string;
  modelName: string;
  usageScenario?: string; // 使用场景
  callCount: number;
  totalTokens: number;
  totalPoints: number;
  totalDuration: number; // 总耗时（秒）
  avgDuration: number; // 平均每次调用耗时（秒）
  successRate: number;
  avgTokensPerCall: number;
}

/**
 * 统计列表响应
 */
export interface StatisticsListResponse {
  total: number;
  list: StatisticsListItem[];
  pageNum: number;
  pageSize: number;
}

// ==================== 使用场景映射 ====================

/**
 * 使用场景（工作流节点类型）中文名称映射
 * key 与 FlowNodeTypeEnum 的实际值一致，对应 model_call_logs.usage_scenario
 */
export const usageScenarioLabels: Record<string, string> = {
  chatNode: 'AI 对话',
  classifyQuestion: '问题分类',
  contentExtract: '内容提取',
  tools: '工具调用',
  cfr: '问题优化',
  datasetSearchNode: '知识库搜索'
};

/**
 * 获取使用场景的中文名称，未知类型原样返回
 */
export function getUsageScenarioLabel(usageScenario?: string | null): string {
  if (!usageScenario) return '-';
  return usageScenarioLabels[usageScenario] || usageScenario;
}

// ==================== 数据导出类型 ====================

/**
 * 导出格式
 */
export type ExportFormat = 'csv' | 'json';

/**
 * 导出类型
 */
export type ExportType = 'overview' | 'by-app' | 'by-model' | 'trend' | 'status' | 'list';

/**
 * 导出参数
 */
export interface ExportQuery extends StatisticsQuery {
  format: ExportFormat;
  exportType: ExportType;
}

// ==================== 错误类型 ====================

/**
 * 统计错误代码
 */
export enum StatisticsErrorCode {
  INVALID_TIME_RANGE = 'INVALID_TIME_RANGE',
  TIME_RANGE_TOO_LARGE = 'TIME_RANGE_TOO_LARGE',
  INVALID_PAGINATION = 'INVALID_PAGINATION',
  QUERY_TIMEOUT = 'QUERY_TIMEOUT',
  DATABASE_ERROR = 'DATABASE_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  EXPORT_FAILED = 'EXPORT_FAILED'
}

/**
 * 统计错误类
 */
export class StatisticsError extends Error {
  public code: StatisticsErrorCode;
  public details?: any;

  constructor(code: StatisticsErrorCode, message: string, details?: any) {
    super(message);
    this.name = 'StatisticsError';
    this.code = code;
    this.details = details;

    Object.setPrototypeOf(this, StatisticsError.prototype);
  }
}
