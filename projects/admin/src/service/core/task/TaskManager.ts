/**
 * 任务管理器
 * 负责任务的注册、调度、执行和历史管理
 */

import cron, { ScheduledTask } from 'node-cron';
import { parseExpression } from 'cron-parser';
import { Pool } from 'pg';
import { addLog } from '@fastgpt/service/common/system/log';

import { TaskStorage } from './TaskStorage';
import { ParameterParser } from './ParameterParser';

import type { TaskConfig, TaskExecution, TaskResult, QueryOptions } from '@/types/task';
import { TaskError, TaskErrorType } from '@/service/common/errors';

/**
 * 任务管理器类
 */
export class TaskManager {
  // 任务配置映射（taskId -> TaskConfig）
  private configs: Map<string, TaskConfig>;

  // Cron 任务映射（taskId -> ScheduledTask）
  private cronJobs: Map<string, ScheduledTask>;

  // 数据存储层
  private storage: TaskStorage;

  // 参数解析器
  private paramParser: ParameterParser;

  // 正在运行的任务集合（用于并发控制）
  private runningTasks: Set<string>;

  constructor(pool: Pool) {
    this.configs = new Map();
    this.cronJobs = new Map();
    this.storage = new TaskStorage(pool);
    this.paramParser = new ParameterParser();
    this.runningTasks = new Set();
  }

  /**
   * 初始化任务管理器
   * 先同步配置到数据库（只创建不存在的），然后从数据库加载配置到内存
   */
  async initialize(taskConfigs: TaskConfig[]): Promise<void> {
    try {
      addLog.info('开始初始化任务管理器...');

      // 清空现有配置
      this.configs.clear();

      // 第一步：同步配置到数据库（只创建不存在的任务）
      for (const config of taskConfigs) {
        // 验证配置
        this.validateConfig(config);

        // 同步到数据库（如果已存在则跳过）
        await this.storage.syncConfig(config);
      }

      // 第二步：从数据库加载所有任务配置到内存
      const dbConfigs = await this.storage.getAllTaskConfigs();
      
      for (const dbConfig of dbConfigs) {
        // 从 taskConfigs 中找到对应的 executor
        const sourceConfig = taskConfigs.find(c => c.id === dbConfig.id);
        
        if (!sourceConfig) {
          addLog.warn(`数据库中的任务配置在代码中不存在: ${dbConfig.id}`);
          continue;
        }

        // 使用数据库中的配置，但保留代码中的 executor
        const config: TaskConfig = {
          id: dbConfig.id,
          name: dbConfig.name,
          description: dbConfig.description || undefined,
          cronExpression: dbConfig.cron_expression,
          timezone: dbConfig.timezone,
          enabled: dbConfig.enabled,
          executorName: dbConfig.executor_name,
          defaultParams: dbConfig.default_params || undefined,
          maxExecutionTime: dbConfig.max_execution_time,
          retryCount: dbConfig.retry_count,
          retryInterval: dbConfig.retry_interval,
          executor: sourceConfig.executor // 使用代码中的 executor 函数
        };

        // 存储到内存
        this.configs.set(config.id, config);
        addLog.info(`任务配置已加载（从数据库）: ${config.id} - ${config.name}`);
      }

      addLog.info(`任务管理器初始化完成，共加载 ${this.configs.size} 个任务`);
    } catch (error) {
      addLog.error('任务管理器初始化失败', error as Error);
      throw error;
    }
  }

  /**
   * 验证任务配置
   */
  private validateConfig(config: TaskConfig): void {
    if (!config.id) {
      throw new TaskError(TaskErrorType.PARAMETER_INVALID, '任务 ID 不能为空');
    }

    if (!config.name) {
      throw new TaskError(TaskErrorType.PARAMETER_INVALID, '任务名称不能为空');
    }

    if (!config.cronExpression) {
      throw new TaskError(
        TaskErrorType.PARAMETER_INVALID,
        `任务 ${config.id} 的 cron 表达式不能为空`
      );
    }

    if (!cron.validate(config.cronExpression)) {
      throw new TaskError(
        TaskErrorType.PARAMETER_INVALID,
        `任务 ${config.id} 的 cron 表达式无效: ${config.cronExpression}`
      );
    }

    if (!config.executor || typeof config.executor !== 'function') {
      throw new TaskError(TaskErrorType.PARAMETER_INVALID, `任务 ${config.id} 的执行器无效`);
    }
  }

  /**
   * 获取任务配置
   */
  getTaskConfig(taskId: string): TaskConfig | undefined {
    return this.configs.get(taskId);
  }

  /**
   * 获取所有任务配置
   */
  getAllTaskConfigs(): TaskConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * 启动所有启用的任务
   */
  async startAll(): Promise<void> {
    try {
      addLog.info('开始启动所有启用的任务...');

      // 从数据库获取启用的任务配置
      const enabledConfigs = await this.storage.getEnabledTaskConfigs();

      let startedCount = 0;
      for (const dbConfig of enabledConfigs) {
        const config = this.configs.get(dbConfig.id);
        if (config) {
          await this.startTask(config.id);
          startedCount++;
        } else {
          addLog.warn(`任务配置不存在: ${dbConfig.id}`);
        }
      }

      addLog.info(`已启动 ${startedCount} 个任务`);
    } catch (error) {
      addLog.error('启动任务失败', error as Error);
      throw error;
    }
  }

  /**
   * 启动指定任务的调度
   */
  async startTask(taskId: string): Promise<void> {
    const config = this.configs.get(taskId);

    if (!config) {
      throw new TaskError(TaskErrorType.CONFIG_NOT_FOUND, `任务配置不存在: ${taskId}`);
    }

    // 如果任务已经在运行，先停止
    if (this.cronJobs.has(taskId)) {
      this.stopTask(taskId);
    }

    try {
      // 创建 cron 任务
      const cronJob = cron.schedule(
        config.cronExpression,
        async () => {
          addLog.info(`定时任务触发: ${taskId} - ${config.name}`);
          try {
            await this.executeTask(taskId);
          } catch (error) {
            addLog.error(`定时任务执行失败: ${taskId}`, error as Error);
          }
        },
        {
          scheduled: true,
          timezone: config.timezone || 'Asia/Shanghai'
        }
      );

      this.cronJobs.set(taskId, cronJob);
      addLog.info(`任务调度已启动: ${taskId} - ${config.name}`);
    } catch (error) {
      addLog.error(`启动任务调度失败: ${taskId}`, error as Error);
      throw new TaskError(
        TaskErrorType.TASK_EXECUTION_FAILED,
        `启动任务调度失败: ${taskId}`,
        error
      );
    }
  }

  /**
   * 停止指定任务的调度
   */
  stopTask(taskId: string): void {
    const cronJob = this.cronJobs.get(taskId);

    if (cronJob) {
      cronJob.stop();
      this.cronJobs.delete(taskId);
      addLog.info(`任务调度已停止: ${taskId}`);
    }
  }

  /**
   * 执行任务（定时或手动）
   */
  async executeTask(taskId: string, params?: Record<string, any>): Promise<TaskResult> {
    const config = this.configs.get(taskId);

    if (!config) {
      throw new TaskError(TaskErrorType.CONFIG_NOT_FOUND, `任务配置不存在: ${taskId}`);
    }

    // 并发控制：检查任务是否正在运行
    if (this.runningTasks.has(taskId)) {
      throw new TaskError(TaskErrorType.TASK_ALREADY_RUNNING, `任务正在运行中: ${taskId}`);
    }

    // 尝试获取任务锁
    const lockAcquired = await this.storage.acquireLock(taskId);
    if (!lockAcquired) {
      throw new TaskError(
        TaskErrorType.TASK_ALREADY_RUNNING,
        `任务正在运行中（锁已被占用）: ${taskId}`
      );
    }

    // 标记任务为运行中
    this.runningTasks.add(taskId);

    try {
      // 执行任务（带重试机制）
      return await this.executeTaskWithRetry(taskId, config, params);
    } finally {
      // 释放任务锁
      await this.storage.releaseLock(taskId);

      // 移除运行标记
      this.runningTasks.delete(taskId);
    }
  }

  /**
   * 执行任务（带重试机制）
   */
  private async executeTaskWithRetry(
    taskId: string,
    config: TaskConfig,
    params?: Record<string, any>
  ): Promise<TaskResult> {
    const maxRetries = config.retryCount || 0;
    const retryInterval = config.retryInterval || 60000; // 默认 1 分钟
    let lastError: unknown;

    // 尝试执行任务（初次执行 + 重试）
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const isRetry = attempt > 0;

      try {
        // 如果是重试，等待重试间隔
        if (isRetry) {
          addLog.info(`任务重试 (${attempt}/${maxRetries}): ${taskId} - ${config.name}`, {
            retryInterval
          });
          await this.sleep(retryInterval);
        }

        // 执行单次任务
        const result = await this.executeSingleTask(taskId, config, params, attempt, maxRetries);

        // 执行成功，返回结果
        if (result.success) {
          if (isRetry) {
            addLog.info(`任务重试成功: ${taskId} (重试次数: ${attempt})`);
          }
          return result;
        }

        // 执行失败但返回了结果（非异常），记录并继续重试
        lastError = new Error(result.message || '任务执行失败');
        addLog.warn(`任务执行失败: ${taskId} (尝试 ${attempt + 1}/${maxRetries + 1})`, {
          message: result.message
        });
      } catch (error) {
        lastError = error;
        addLog.error(
          `任务执行异常: ${taskId} (尝试 ${attempt + 1}/${maxRetries + 1})`,
          error as Error
        );

        // 如果是最后一次尝试，抛出错误
        if (attempt === maxRetries) {
          break;
        }
      }
    }

    // 所有重试都失败，抛出最后的错误
    addLog.error(`任务最终失败: ${taskId} (已重试 ${maxRetries} 次)`);
    throw new TaskError(
      TaskErrorType.TASK_EXECUTION_FAILED,
      `任务执行失败（已重试 ${maxRetries} 次）: ${taskId}`,
      lastError
    );
  }

  /**
   * 执行单次任务
   */
  private async executeSingleTask(
    taskId: string,
    config: TaskConfig,
    params: Record<string, any> | undefined,
    attemptNumber: number,
    maxRetries: number
  ): Promise<TaskResult> {
    const startTime = new Date();
    let executionId: number | null = null;

    try {
      // 解析任务参数
      const executionParams = params || config.defaultParams || {};
      const parsedParams = this.paramParser.parse(executionParams);

      const logPrefix = attemptNumber > 0 ? `[重试 ${attemptNumber}/${maxRetries}] ` : '';
      addLog.info(`${logPrefix}开始执行任务: ${taskId} - ${config.name}`, {
        params: parsedParams,
        attempt: attemptNumber
      });

      // 创建执行记录
      executionId = await this.storage.createExecution({
        taskId: config.id,
        taskName: config.name,
        startTime,
        status: 'running',
        params: parsedParams
      });

      // 执行任务（带超时控制）
      const maxExecutionTime = config.maxExecutionTime || 3600000; // 默认 1 小时
      const result = await this.executeWithTimeout(
        config.executor(parsedParams),
        maxExecutionTime,
        taskId
      );

      // 计算执行时间
      const endTime = new Date();
      const executionTimeMs = endTime.getTime() - startTime.getTime();

      // 更新执行记录
      await this.storage.updateExecution(executionId, {
        endTime,
        status: result.success ? 'success' : 'failed',
        result,
        executionTimeMs,
        errorMessage: result.success ? undefined : result.message
      });

      addLog.info(`${logPrefix}任务执行完成: ${taskId}`, {
        success: result.success,
        executionTimeMs,
        attempt: attemptNumber
      });

      return result;
    } catch (error) {
      const endTime = new Date();
      const executionTimeMs = endTime.getTime() - startTime.getTime();

      // 提取详细的错误信息
      const errorInfo = this.extractErrorInfo(error);

      // 更新执行记录为失败
      if (executionId) {
        await this.storage.updateExecution(executionId, {
          endTime,
          status: 'failed',
          errorMessage: errorInfo.fullMessage,
          executionTimeMs
        });
      }

      // 重新抛出错误，由上层处理重试
      throw error;
    }
  }

  /**
   * 延迟执行（用于重试间隔）
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 带超时控制的任务执行
   */
  private async executeWithTimeout(
    promise: Promise<TaskResult>,
    timeout: number,
    taskId: string
  ): Promise<TaskResult> {
    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<TaskResult>((_, reject) => {
      timeoutId = setTimeout(() => {
        const timeoutError = new TaskError(
          TaskErrorType.TASK_TIMEOUT,
          `任务执行超时: ${taskId} (最大执行时间: ${timeout}ms)`
        );

        addLog.error(`任务执行超时: ${taskId}`, {
          maxExecutionTime: timeout,
          taskId
        });

        reject(timeoutError);
      }, timeout);
    });

    try {
      // 竞速执行：任务完成 vs 超时
      const result = await Promise.race([promise, timeoutPromise]);

      // 任务完成，清除超时定时器
      clearTimeout(timeoutId!);

      return result;
    } catch (error) {
      // 清除超时定时器
      clearTimeout(timeoutId!);

      // 如果是超时错误，记录详细信息
      if (error instanceof TaskError && error.type === TaskErrorType.TASK_TIMEOUT) {
        addLog.error(`任务超时终止: ${taskId}`, {
          maxExecutionTime: timeout,
          errorType: error.type,
          errorMessage: error.message
        });
      }

      // 重新抛出错误
      throw error;
    }
  }

  /**
   * 提取详细的错误信息
   */
  private extractErrorInfo(error: unknown): {
    type: string;
    message: string;
    stack?: string;
    fullMessage: string;
  } {
    let type = 'UnknownError';
    let message = 'Unknown error';
    let stack: string | undefined;

    if (error instanceof TaskError) {
      // TaskError 类型
      type = error.type;
      message = error.message;
      stack = error.stack;
    } else if (error instanceof Error) {
      // 标准 Error 类型
      type = error.name || 'Error';
      message = error.message;
      stack = error.stack;
    } else if (typeof error === 'string') {
      // 字符串错误
      message = error;
    } else if (error && typeof error === 'object') {
      // 对象错误
      message = JSON.stringify(error);
    }

    // 构建完整的错误消息（包含类型、消息和堆栈）
    let fullMessage = `[${type}] ${message}`;
    if (stack) {
      fullMessage += `\n堆栈信息:\n${stack}`;
    }

    return {
      type,
      message,
      stack,
      fullMessage
    };
  }

  /**
   * 启用/禁用任务
   */
  async toggleTask(taskId: string, enabled: boolean): Promise<void> {
    const config = this.configs.get(taskId);

    if (!config) {
      throw new TaskError(TaskErrorType.CONFIG_NOT_FOUND, `任务配置不存在: ${taskId}`);
    }

    try {
      // 更新数据库
      await this.storage.updateEnabled(taskId, enabled);

      // 更新内存配置
      config.enabled = enabled;

      // 启动或停止调度
      if (enabled) {
        await this.startTask(taskId);
      } else {
        this.stopTask(taskId);
      }

      addLog.info(`任务状态已更新: ${taskId} (enabled: ${enabled})`);
    } catch (error) {
      addLog.error(`更新任务状态失败: ${taskId}`, error as Error);
      throw error;
    }
  }

  /**
   * 更新任务参数
   */
  async updateTaskParams(taskId: string, params: Record<string, any>): Promise<void> {
    const config = this.configs.get(taskId);

    if (!config) {
      throw new TaskError(TaskErrorType.CONFIG_NOT_FOUND, `任务配置不存在: ${taskId}`);
    }

    try {
      // 更新数据库
      await this.storage.updateTaskParams(taskId, params);

      // 更新内存配置
      config.defaultParams = params;

      addLog.info(`任务参数已更新: ${taskId}`, { params });
    } catch (error) {
      addLog.error(`更新任务参数失败: ${taskId}`, error as Error);
      throw error;
    }
  }

  /**
   * 更新任务描述
   */
  async updateTaskDescription(taskId: string, description: string): Promise<void> {
    const config = this.configs.get(taskId);

    if (!config) {
      throw new TaskError(TaskErrorType.CONFIG_NOT_FOUND, `任务配置不存在: ${taskId}`);
    }

    try {
      // 更新数据库
      await this.storage.updateTaskDescription(taskId, description);

      // 更新内存配置
      config.description = description;

      addLog.info(`任务描述已更新: ${taskId}`, { description });
    } catch (error) {
      addLog.error(`更新任务描述失败: ${taskId}`, error as Error);
      throw error;
    }
  }

  /**
   * 统一更新任务配置（描述、Cron 表达式、参数）
   * 在一个事务中完成所有更新
   */
  async updateTaskConfig(
    taskId: string,
    updates: {
      description?: string;
      cronExpression?: string;
      params?: Record<string, any>;
    }
  ): Promise<void> {
    const config = this.configs.get(taskId);

    if (!config) {
      throw new TaskError(TaskErrorType.CONFIG_NOT_FOUND, `任务配置不存在: ${taskId}`);
    }

    try {
      // 如果更新了 Cron 表达式，先验证
      if (updates.cronExpression && !cron.validate(updates.cronExpression)) {
        throw new TaskError(
          TaskErrorType.PARAMETER_INVALID,
          `Cron 表达式无效: ${updates.cronExpression}`
        );
      }

      // 在一个事务中更新数据库
      await this.storage.updateTaskConfig(taskId, updates);

      // 更新内存配置
      if (updates.description !== undefined) {
        config.description = updates.description;
      }

      if (updates.cronExpression) {
        config.cronExpression = updates.cronExpression;
      }

      if (updates.params) {
        config.defaultParams = updates.params;
      }

      addLog.info(`任务配置已更新: ${taskId}`, updates);
    } catch (error) {
      addLog.error(`更新任务配置失败: ${taskId}`, error as Error);
      throw error;
    }
  }

  /**
   * 更新任务 Cron 表达式
   */
  async updateCronExpression(taskId: string, cronExpression: string): Promise<void> {
    const config = this.configs.get(taskId);

    if (!config) {
      throw new TaskError(TaskErrorType.CONFIG_NOT_FOUND, `任务配置不存在: ${taskId}`);
    }

    try {
      // 更新数据库
      await this.storage.updateCronExpression(taskId, cronExpression);

      // 更新内存配置
      config.cronExpression = cronExpression;

      addLog.info(`任务 Cron 表达式已更新: ${taskId}`, { cronExpression });
    } catch (error) {
      addLog.error(`更新任务 Cron 表达式失败: ${taskId}`, error as Error);
      throw error;
    }
  }

  /**
   * 计算任务的下次执行时间
   */
  getNextExecutionTime(taskId: string): Date | null {
    const config = this.configs.get(taskId);

    if (!config) {
      return null;
    }

    try {
      // 使用 cron-parser 解析 cron 表达式
      const interval = parseExpression(config.cronExpression, {
        currentDate: new Date(),
        tz: config.timezone || 'Asia/Shanghai'
      });

      // 获取下次执行时间
      const nextDate = interval.next().toDate();
      return nextDate;
    } catch (error) {
      addLog.error(`计算下次执行时间失败: ${taskId}`, error as Error);
      return null;
    }
  }

  /**
   * 获取执行历史
   */
  async getExecutionHistory(
    taskId?: string,
    options?: QueryOptions
  ): Promise<{ total: number; executions: TaskExecution[] }> {
    try {
      const queryOptions: QueryOptions = {
        ...options,
        taskId
      };

      return await this.storage.queryExecutions(queryOptions);
    } catch (error) {
      addLog.error('获取执行历史失败', error as Error);
      throw error;
    }
  }

  /**
   * 获取任务的最近一次执行记录
   */
  async getLastExecution(taskId: string): Promise<TaskExecution | null> {
    try {
      return await this.storage.getLastExecution(taskId);
    } catch (error) {
      addLog.error(`获取最近执行记录失败: ${taskId}`, error as Error);
      throw error;
    }
  }

  /**
   * 根据执行 ID 获取执行记录详情
   */
  async getExecutionById(executionId: number): Promise<TaskExecution | null> {
    try {
      return await this.storage.getExecutionById(executionId);
    } catch (error) {
      addLog.error(`获取执行记录详情失败: ${executionId}`, error as Error);
      throw error;
    }
  }

  /**
   * 停止所有任务
   */
  stopAll(): void {
    addLog.info('停止所有任务调度...');

    for (const [taskId, cronJob] of this.cronJobs.entries()) {
      cronJob.stop();
      addLog.info(`任务调度已停止: ${taskId}`);
    }

    this.cronJobs.clear();
    addLog.info('所有任务调度已停止');
  }

  /**
   * 获取正在运行的任务列表
   */
  getRunningTasks(): string[] {
    return Array.from(this.runningTasks);
  }

  /**
   * 检查任务是否正在运行
   */
  isTaskRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId);
  }
}
