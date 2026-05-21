// ==================== API 请求/响应类型 ====================

/**
 * 手动触发请求
 */
export interface TriggerRequest {
  startDate?: string; // ISO 8601 格式
  endDate?: string; // ISO 8601 格式
}

/**
 * 手动触发响应
 */
export interface TriggerResponse {
  success: boolean;
  taskId: string;
  message: string;
}

/**
 * 状态查询响应
 */
export interface StatusResponse {
  isRunning: boolean;
  currentTask: {
    taskId: string;
    startTime: string;
    progress: number;
  } | null;
  lastExecutions: Array<{
    taskId: string;
    startTime: string;
    endTime: string;
    status: string;
    recordsProcessed: number;
  }>;
}

/**
 * 执行历史响应
 */
export interface HistoryResponse {
  executions: Array<{
    id: string;
    startTime: string;
    endTime: string;
    status: string;
    extractedCount: number;
    insertedCount: number;
    failedCount: number;
    executionTime: number;
    errors?: string[];
  }>;
}

/**
 * 健康检查响应
 */
export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  mongodb: {
    connected: boolean;
    latency: number;
  };
  postgres: {
    connected: boolean;
    latency: number;
  };
  scheduler: {
    enabled: boolean;
    nextExecution: string;
  };
  taskManager?: {
    initialized: boolean;
    registeredTasks: number;
    runningTasks: string[];
    enabledTasks: number;
  };
  lastExecution?: {
    time: string;
    status: string;
    recordsProcessed: number;
    executionTime: number;
    errors?: string[];
  } | null;
}
