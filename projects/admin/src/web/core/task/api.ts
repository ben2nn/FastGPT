/**
 * 任务管理 API 封装
 * 封装所有任务管理相关的 API 调用
 */

import { GET, POST } from '@/web/common/api/request';

/**
 * 任务列表项类型
 */
export type TaskListItem = {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  timezone?: string;
  enabled: boolean;
  executorName: string;
  defaultParams?: Record<string, any>;
  maxExecutionTime?: number;
  retryCount?: number;
  retryInterval?: number;
  nextExecutionTime: string | null;
  lastExecution: {
    id: number;
    status: string;
    startTime: string;
    endTime?: string;
    executionTimeMs?: number;
    errorMessage?: string;
  } | null;
  isRunning: boolean;
};

/**
 * 任务详情类型
 */
export type TaskDetail = {
  config: TaskListItem;
  nextExecutionTime: string | null;
  lastExecution: {
    id: number;
    taskId: string;
    taskName: string;
    startTime: string;
    endTime?: string;
    status: string;
    params?: Record<string, any>;
    result?: any;
    errorMessage?: string;
    executionTimeMs?: number;
  } | null;
};

/**
 * 任务执行记录类型
 */
export type TaskExecution = {
  id: number;
  taskId: string;
  taskName: string;
  startTime: string;
  endTime?: string;
  status: string;
  params?: Record<string, any>;
  result?: any;
  errorMessage?: string;
  executionTimeMs?: number;
  createdAt: string;
};

/**
 * 执行历史查询参数
 */
export type ExecutionHistoryQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  startTime?: string;
  endTime?: string;
};

/**
 * 执行历史响应
 */
export type ExecutionHistoryResponse = {
  executions: TaskExecution[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * 任务执行结果
 */
export type TaskExecutionResult = {
  executionId: number;
  result: {
    success: boolean;
    data?: any;
    message?: string;
    metadata?: Record<string, any>;
  };
};

/**
 * 获取任务列表
 */
export const getTaskList = () => {
  return GET<{ tasks: TaskListItem[]; total: number }>('/admin/tasks/list');
};

/**
 * 获取任务详情
 * @param taskId 任务 ID
 */
export const getTaskDetail = (taskId: string) => {
  return GET<TaskDetail>(`/admin/tasks/${taskId}/detail`);
};

/**
 * 启用/禁用任务
 * @param taskId 任务 ID
 * @param enabled 是否启用
 */
export const toggleTask = (taskId: string, enabled: boolean) => {
  return POST<{ success: boolean }>(`/admin/tasks/${taskId}/toggle`, { enabled });
};

/**
 * 手动执行任务
 * @param taskId 任务 ID
 * @param params 执行参数（可选）
 */
export const executeTask = (taskId: string, params?: Record<string, any>) => {
  return POST<TaskExecutionResult>(`/admin/tasks/${taskId}/execute`, { params });
};

/**
 * 获取任务执行历史
 * @param taskId 任务 ID
 * @param query 查询参数
 */
export const getExecutionHistory = (taskId: string, query?: ExecutionHistoryQuery) => {
  return GET<ExecutionHistoryResponse>(`/admin/tasks/${taskId}/executions`, query || {});
};

/**
 * 获取执行详情
 * @param executionId 执行 ID
 */
export const getExecutionDetail = (executionId: number) => {
  return GET<{ execution: TaskExecution }>(`/admin/tasks/executions/${executionId}`);
};

/**
 * 更新任务配置（Cron 表达式、参数、描述）
 * @param taskId 任务 ID
 * @param config 配置更新
 */
export const updateCronExpression = (
  taskId: string,
  config: {
    cronExpression?: string;
    params?: Record<string, any>;
    description?: string;
  }
) => {
  return POST<{ success: boolean; message: string; nextExecutionTime: string | null }>(
    `/admin/tasks/${taskId}/update-cron`,
    config
  );
};

/**
 * 更新任务参数
 * @param taskId 任务 ID
 * @param params 任务参数
 */
export const updateTaskParams = (taskId: string, params: Record<string, any>) => {
  return POST<{ success: boolean; message: string }>(`/admin/tasks/${taskId}/update-params`, {
    params
  });
};

/**
 * 验证 Cron 表达式
 * @param taskId 任务 ID
 * @param cronExpression Cron 表达式
 * @param timezone 时区（可选）
 */
export const validateCronExpression = (
  taskId: string,
  cronExpression: string,
  timezone?: string
) => {
  return POST<{
    valid: boolean;
    message: string;
    nextExecutions?: string[];
    recommendedParams?: Record<string, any>;
  }>(`/admin/tasks/${taskId}/validate-cron`, { cronExpression, timezone });
};

/**
 * 重新初始化任务
 * @param taskId 任务 ID
 */
export const reinitializeTask = (taskId: string) => {
  return POST<{ success: boolean; message: string; nextExecutionTime: string | null }>(
    `/admin/tasks/${taskId}/reinitialize`,
    {}
  );
};
