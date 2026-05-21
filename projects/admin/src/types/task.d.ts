/**
 * 任务管理器类型定义
 */

// 任务执行状态
export type TaskExecutionStatus = 'running' | 'success' | 'failed';

// 任务执行函数类型
export type TaskExecutorFunction = (params: Record<string, any>) => Promise<TaskResult>;

// 任务配置
export interface TaskConfig {
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
  executor: TaskExecutorFunction;
}

// 任务执行结果
export interface TaskResult {
  success: boolean;
  data?: any;
  message?: string;
  metadata?: Record<string, any>;
}

// 任务执行记录
export interface TaskExecution {
  id: number;
  taskId: string;
  taskName: string;
  startTime: Date;
  endTime?: Date;
  status: TaskExecutionStatus;
  params?: Record<string, any>;
  result?: TaskResult;
  errorMessage?: string;
  executionTimeMs?: number;
  createdAt?: Date;
}

// 参数模板类型
export type ParameterTemplate =
  | { type: 'fixed'; value: any }
  | { type: 'dynamic'; template: string };

// 查询选项
export interface QueryOptions {
  taskId?: string;
  status?: TaskExecutionStatus;
  startTime?: Date;
  endTime?: Date;
  page?: number;
  pageSize?: number;
}

// 数据库中的任务配置（不包含 executor 函数）
export interface TaskConfigDB {
  id: string;
  name: string;
  description?: string;
  cron_expression: string;
  timezone?: string;
  enabled: boolean;
  executor_name: string;
  default_params?: Record<string, any>;
  max_execution_time?: number;
  retry_count?: number;
  retry_interval?: number;
  created_at?: Date;
  updated_at?: Date;
}

// 数据库中的任务执行记录
export interface TaskExecutionDB {
  id: number;
  task_id: string;
  task_name: string;
  start_time: Date;
  end_time?: Date;
  status: TaskExecutionStatus;
  params?: Record<string, any>;
  result?: TaskResult;
  error_message?: string;
  execution_time_ms?: number;
  created_at?: Date;
}
