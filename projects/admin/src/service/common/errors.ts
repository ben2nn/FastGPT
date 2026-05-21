export enum TaskErrorType {
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  TASK_ALREADY_RUNNING = 'TASK_ALREADY_RUNNING',
  TASK_EXECUTION_FAILED = 'TASK_EXECUTION_FAILED',
  TASK_TIMEOUT = 'TASK_TIMEOUT',
  PARAMETER_INVALID = 'PARAMETER_INVALID',
  DATABASE_ERROR = 'DATABASE_ERROR'
}

export enum ErrorType {
  MONGODB_CONNECTION_ERROR = 'MONGODB_CONNECTION_ERROR',
  POSTGRES_CONNECTION_ERROR = 'POSTGRES_CONNECTION_ERROR',
  DATA_CAP_ERROR = 'DATA_CAP_ERROR',
  DATA_VALIDATION_ERROR = 'DATA_VALIDATION_ERROR',
  DATA_INSERTION_ERROR = 'DATA_INSERTION_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR'
}

/**
 * 数据提取错误类实现
 */
export class SystemError extends Error {
  public type: ErrorType;
  public originalError?: Error;

  constructor(type: ErrorType, message: string, originalError?: Error) {
    super(message);
    this.name = 'DataCapError';
    this.type = type;
    this.originalError = originalError;

    // 保持原型链正确
    Object.setPrototypeOf(this, SystemError.prototype);
  }
}

// 任务错误类
export class TaskError extends Error {
  public type: TaskErrorType;
  public details?: any;

  constructor(type: TaskErrorType, message: string, details?: any) {
    super(message);
    this.name = 'TaskError';
    this.type = type;
    this.details = details;

    // 维护正确的原型链
    Object.setPrototypeOf(this, TaskError.prototype);
  }
}
