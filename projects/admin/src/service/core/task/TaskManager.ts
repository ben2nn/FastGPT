/**
 * 任务管理器
 * 负责任务的注册、调度、执行和历史管理
 */

import type { ScheduledTask } from 'node-cron';
import cron from 'node-cron';
import { parseExpression } from 'cron-parser';
import type { Pool } from 'pg';
import { addLog } from '@fastgpt/service/common/system/log';

import { TaskStorage, type HeldTaskLock } from './TaskStorage';
import { ParameterParser } from './ParameterParser';
import { DEFAULT_TIMEZONE } from '@/web/common/constants';

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
        const sourceConfig = taskConfigs.find((c) => c.id === dbConfig.id);

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

      // 恢复重启前遗留的 running 执行记录（标记失败，可重跑）
      try {
        await this.storage.recoverStaleExecutions();
      } catch (error) {
        addLog.error('遗留执行记录恢复失败（不影响任务管理器启动）', error as Error);
      }
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
          timezone: config.timezone || DEFAULT_TIMEZONE
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
   * 异步受理任务执行（同步段）
   *
   * 完成校验、并发查重、加锁与执行记录创建后立即返回：
   * - executionId：本次运行的执行记录 ID（前端轮询用）
   * - done：后台执行 Promise（重试/超时/终态写入/释放锁），调用方不应 await
   *   （手动执行 API 需要立即返回；cron 与内部调用可 await）
   */
  async startExecution(
    taskId: string,
    params?: Record<string, any>
  ): Promise<{ executionId: number; done: Promise<TaskResult> }> {
    const config = this.configs.get(taskId);

    if (!config) {
      throw new TaskError(TaskErrorType.CONFIG_NOT_FOUND, `任务配置不存在: ${taskId}`);
    }

    // 并发控制：本进程内查重
    if (this.runningTasks.has(taskId)) {
      throw new TaskError(TaskErrorType.TASK_ALREADY_RUNNING, `任务正在运行中: ${taskId}`);
    }

    // 尝试获取任务锁（会话级锁，持有连接至执行结束）
    const held = await this.storage.acquireLock(taskId);
    if (!held) {
      throw new TaskError(
        TaskErrorType.TASK_ALREADY_RUNNING,
        `任务正在运行中（锁已被占用）: ${taskId}`
      );
    }

    // 标记任务为运行中
    this.runningTasks.add(taskId);

    const startTime = new Date();

    try {
      const executionParams = params || config.defaultParams || {};
      const parsedParams = this.paramParser.parse(executionParams);

      // 受理时创建唯一执行记录（一次运行一条）
      const executionId = await this.storage.createExecution({
        taskId: config.id,
        taskName: config.name,
        startTime,
        status: 'running',
        params: parsedParams
      });

      addLog.info(`任务已受理: ${taskId} - ${config.name} (executionId: ${executionId})`, {
        params: parsedParams
      });

      const done = this.runExecution(taskId, config, parsedParams, executionId, startTime, held);
      return { executionId, done };
    } catch (error) {
      // 受理失败：回滚运行标记与锁
      this.runningTasks.delete(taskId);
      await this.storage.releaseLock(held);
      throw error;
    }
  }

  /**
   * 后台执行主体：执行重试循环，结束时释放在内存标记与任务锁
   */
  private async runExecution(
    taskId: string,
    config: TaskConfig,
    parsedParams: Record<string, any>,
    executionId: number,
    startTime: Date,
    held: HeldTaskLock
  ): Promise<TaskResult> {
    try {
      return await this.executeTaskWithRetry(taskId, config, parsedParams, executionId, startTime);
    } finally {
      this.runningTasks.delete(taskId);
      await this.storage.releaseLock(held);
    }
  }

  /**
   * 执行任务（等待完成版本）
   * 定时触发与内部调用使用；手动执行 API 不应使用（请用 startExecution）
   */
  async executeTask(taskId: string, params?: Record<string, any>): Promise<TaskResult> {
    const { done } = await this.startExecution(taskId, params);
    return done;
  }

  /**
   * 执行任务（带重试机制）
   * 所有尝试复用同一条执行记录（executionId），不再为每次尝试创建新记录
   */
  private async executeTaskWithRetry(
    taskId: string,
    config: TaskConfig,
    parsedParams: Record<string, any>,
    executionId: number,
    startTime: Date
  ): Promise<TaskResult> {
    const maxRetries = config.retryCount || 0;
    const retryInterval = config.retryInterval || 60000; // 默认 1 分钟
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const isRetry = attempt > 0;

      try {
        if (isRetry) {
          addLog.info(`任务重试 (${attempt}/${maxRetries}): ${taskId} - ${config.name}`, {
            retryInterval
          });
          await this.sleep(retryInterval);
        }

        // 执行单次尝试（仅执行器 + 超时控制，不写记录）
        const result = await this.executeAttempt(config, parsedParams, taskId);

        if (result.success) {
          const attempts = attempt + 1;
          const endTime = new Date();
          const executionTimeMs = endTime.getTime() - startTime.getTime();
          const finalResult: TaskResult = {
            ...result,
            metadata: { ...(result.metadata || {}), attempts }
          };

          await this.persistExecutionResult(executionId, {
            endTime,
            status: 'success',
            result: finalResult,
            executionTimeMs
          });

          addLog.info(`任务执行完成: ${taskId}`, {
            success: true,
            attempts,
            executionTimeMs
          });

          return finalResult;
        }

        // 返回失败结果（非异常）：记录本次失败信息，继续重试
        lastError = new Error(result.message || '任务执行失败');
        await this.recordAttemptFailure(
          executionId,
          attempt,
          maxRetries,
          result.message || '任务执行失败'
        );
        addLog.warn(`任务执行失败: ${taskId} (尝试 ${attempt + 1}/${maxRetries + 1})`, {
          message: result.message
        });
      } catch (error) {
        lastError = error;
        const errorInfo = this.extractErrorInfo(error);
        await this.recordAttemptFailure(
          executionId,
          attempt,
          maxRetries,
          errorInfo.fullMessage,
          true
        );
        addLog.error(
          `任务执行异常: ${taskId} (尝试 ${attempt + 1}/${maxRetries + 1})`,
          error as Error
        );
      }
    }

    // 所有尝试均失败：写入终态并抛出
    const endTime = new Date();
    const executionTimeMs = endTime.getTime() - startTime.getTime();
    const errorMessage = this.extractErrorInfo(lastError).fullMessage;
    const attemptsText = `执行失败（共 ${maxRetries + 1} 次尝试，已重试 ${maxRetries} 次）`;

    await this.persistExecutionResult(executionId, {
      endTime,
      status: 'failed',
      errorMessage: `${attemptsText}: ${errorMessage}`,
      executionTimeMs
    });

    addLog.error(`任务最终失败: ${taskId} (已重试 ${maxRetries} 次)`);

    if (lastError instanceof TaskError) {
      throw new TaskError(lastError.type, `${attemptsText}: ${lastError.message}`, lastError);
    }
    throw new TaskError(
      TaskErrorType.TASK_EXECUTION_FAILED,
      `${attemptsText}: ${taskId}`,
      lastError
    );
  }

  /**
   * 记录一次尝试失败（执行记录保持 running，错误信息带尝试序号）
   */
  private async recordAttemptFailure(
    executionId: number,
    attempt: number,
    maxRetries: number,
    message: string,
    isException = false
  ): Promise<void> {
    try {
      await this.storage.updateExecution(executionId, {
        errorMessage: `[尝试 ${attempt + 1}/${maxRetries + 1}] ${message}`
      });
    } catch (error) {
      addLog.error(`记录尝试失败信息失败 (executionId: ${executionId})`, error as Error);
    }
  }

  /**
   * 写入执行记录终态
   * 失败重试一次（瞬时数据库错误），仍失败则记录错误日志但不抛出（避免掩盖执行结果）；
   * 记录可能停留在 running，由下次服务启动的遗留记录恢复收敛
   */
  private async persistExecutionResult(
    executionId: number,
    updates: Parameters<TaskStorage['updateExecution']>[1]
  ): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.storage.updateExecution(executionId, updates);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          addLog.warn(`写入执行记录终态失败，200ms 后重试 (executionId: ${executionId})`, {
            error: error instanceof Error ? error.message : String(error)
          });
          await this.sleep(200);
        }
      }
    }

    addLog.error(
      `写入执行记录终态失败（已重试 1 次，记录可能停留在 running，服务重启后自动收敛） (executionId: ${executionId})`,
      lastError as Error
    );
  }

  /**
   * 执行单次尝试（仅执行器与超时控制）
   */
  private async executeAttempt(
    config: TaskConfig,
    parsedParams: Record<string, any>,
    taskId: string
  ): Promise<TaskResult> {
    const maxExecutionTime = config.maxExecutionTime || 3600000; // 默认 1 小时
    addLog.info(`开始执行任务: ${taskId} - ${config.name}`, {
      params: parsedParams
    });

    return this.executeWithTimeout(config.executor(parsedParams), maxExecutionTime, taskId);
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
        tz: config.timezone || DEFAULT_TIMEZONE
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
