/**
 * 任务存储层
 * 负责任务配置和执行历史的数据库操作
 */

import type { Pool } from 'pg';
import { addLog } from '@fastgpt/service/common/system/log';
import { DEFAULT_TIMEZONE } from '@/web/common/constants';
import type {
  TaskConfig,
  TaskExecution,
  TaskConfigDB,
  TaskExecutionDB,
  QueryOptions
} from '@/types/task';
import { TaskError, TaskErrorType } from '@/service/common/errors';

/**
 * 任务存储类
 */
export class TaskStorage {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * 同步任务配置到数据库
   * 如果任务不存在则创建，存在则跳过（不覆盖数据库中的配置）
   */
  async syncConfig(config: TaskConfig): Promise<void> {
    const client = await this.pool.connect();

    try {
      // 检查任务是否已存在
      const existingResult = await client.query(
        'SELECT id, cron_expression, default_params FROM task_configs WHERE id = $1',
        [config.id]
      );

      if (existingResult.rowCount && existingResult.rowCount > 0) {
        // 任务已存在，跳过更新，保留数据库中的配置
        const existing = existingResult.rows[0];
        addLog.info(`任务配置已存在，跳过更新: ${config.id}`, {
          dbCron: existing.cron_expression,
          codeCron: config.cronExpression,
          dbParams: existing.default_params,
          codeParams: config.defaultParams
        });
        return;
      }

      // 任务不存在，创建新记录
      addLog.info(`任务配置不存在，创建新记录: ${config.id}`);
      const now = new Date();
      await client.query(
        `INSERT INTO task_configs (
          id, name, description, cron_expression, timezone,
          enabled, executor_name, default_params,
          max_execution_time, retry_count, retry_interval,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          config.id,
          config.name,
          config.description || null,
          config.cronExpression,
          config.timezone || DEFAULT_TIMEZONE,
          config.enabled,
          config.executorName,
          config.defaultParams ? JSON.stringify(config.defaultParams) : null,
          config.maxExecutionTime || 3600000,
          config.retryCount || 0,
          config.retryInterval || 60000,
          now,
          now
        ]
      );

      addLog.info(`任务配置已创建: ${config.id}`);
    } catch (error) {
      addLog.error(`同步任务配置失败: ${config.id}`, error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, `同步任务配置失败: ${config.id}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * 更新任务启用状态
   */
  async updateEnabled(taskId: string, enabled: boolean): Promise<void> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'UPDATE task_configs SET enabled = $1, updated_at = $2 WHERE id = $3',
        [enabled, new Date(), taskId]
      );

      if (!result.rowCount || result.rowCount === 0) {
        throw new TaskError(TaskErrorType.CONFIG_NOT_FOUND, `任务配置不存在: ${taskId}`);
      }

      addLog.info(`任务状态已更新: ${taskId} (enabled: ${enabled})`);
    } catch (error) {
      if (error instanceof TaskError) {
        throw error;
      }
      addLog.error(`更新任务状态失败: ${taskId}`, error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, `更新任务状态失败: ${taskId}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * 更新任务参数
   */
  async updateTaskParams(taskId: string, params: Record<string, any>): Promise<void> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'UPDATE task_configs SET default_params = $1, updated_at = $2 WHERE id = $3',
        [JSON.stringify(params), new Date(), taskId]
      );

      if (!result.rowCount || result.rowCount === 0) {
        throw new TaskError(TaskErrorType.CONFIG_NOT_FOUND, `任务配置不存在: ${taskId}`);
      }

      addLog.info(`任务参数已更新: ${taskId}`, { params });
    } catch (error) {
      if (error instanceof TaskError) {
        throw error;
      }
      addLog.error(`更新任务参数失败: ${taskId}`, error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, `更新任务参数失败: ${taskId}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * 更新任务 Cron 表达式
   */
  async updateCronExpression(taskId: string, cronExpression: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'UPDATE task_configs SET cron_expression = $1, updated_at = $2 WHERE id = $3',
        [cronExpression, new Date(), taskId]
      );

      if (!result.rowCount || result.rowCount === 0) {
        throw new TaskError(TaskErrorType.CONFIG_NOT_FOUND, `任务配置不存在: ${taskId}`);
      }

      addLog.info(`任务 Cron 表达式已更新: ${taskId}`, { cronExpression });
    } catch (error) {
      if (error instanceof TaskError) {
        throw error;
      }
      addLog.error(`更新任务 Cron 表达式失败: ${taskId}`, error as Error);
      throw new TaskError(
        TaskErrorType.DATABASE_ERROR,
        `更新任务 Cron 表达式失败: ${taskId}`,
        error
      );
    } finally {
      client.release();
    }
  }

  /**
   * 更新任务描述
   */
  async updateTaskDescription(taskId: string, description: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'UPDATE task_configs SET description = $1, updated_at = $2 WHERE id = $3',
        [description || null, new Date(), taskId]
      );

      if (!result.rowCount || result.rowCount === 0) {
        throw new TaskError(TaskErrorType.CONFIG_NOT_FOUND, `任务配置不存在: ${taskId}`);
      }

      addLog.info(`任务描述已更新: ${taskId}`, { description });
    } catch (error) {
      if (error instanceof TaskError) {
        throw error;
      }
      addLog.error(`更新任务描述失败: ${taskId}`, error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, `更新任务描述失败: ${taskId}`, error);
    } finally {
      client.release();
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
    const client = await this.pool.connect();

    try {
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      // 构建动态更新语句
      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        updateValues.push(updates.description || null);
      }

      if (updates.cronExpression) {
        updateFields.push(`cron_expression = $${paramIndex++}`);
        updateValues.push(updates.cronExpression);
      }

      if (updates.params) {
        updateFields.push(`default_params = $${paramIndex++}`);
        updateValues.push(JSON.stringify(updates.params));
      }

      if (updateFields.length === 0) {
        return; // 没有需要更新的字段
      }

      // 添加 updated_at
      updateFields.push(`updated_at = $${paramIndex++}`);
      updateValues.push(new Date());

      // 添加 WHERE 条件
      updateValues.push(taskId);

      const query = `UPDATE task_configs SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`;

      const result = await client.query(query, updateValues);

      if (!result.rowCount || result.rowCount === 0) {
        throw new TaskError(TaskErrorType.CONFIG_NOT_FOUND, `任务配置不存在: ${taskId}`);
      }

      addLog.info(`任务配置已更新: ${taskId}`, updates);
    } catch (error) {
      if (error instanceof TaskError) {
        throw error;
      }
      addLog.error(`更新任务配置失败: ${taskId}`, error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, `更新任务配置失败: ${taskId}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * 创建执行记录
   * 返回新创建的执行记录 ID
   */
  async createExecution(execution: Partial<TaskExecution>): Promise<number> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `INSERT INTO task_executions (
          task_id, task_name, start_time, status, params
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        [
          execution.taskId,
          execution.taskName,
          execution.startTime || new Date(),
          execution.status || 'running',
          execution.params ? JSON.stringify(execution.params) : null
        ]
      );

      const executionId = result.rows[0].id;
      addLog.info(`执行记录已创建: ${executionId} (任务: ${execution.taskId})`);

      return executionId;
    } catch (error) {
      addLog.error(`创建执行记录失败: ${execution.taskId}`, error as Error);
      throw new TaskError(
        TaskErrorType.DATABASE_ERROR,
        `创建执行记录失败: ${execution.taskId}`,
        error
      );
    } finally {
      client.release();
    }
  }

  /**
   * 更新执行记录
   */
  async updateExecution(id: number, updates: Partial<TaskExecution>): Promise<void> {
    const client = await this.pool.connect();

    try {
      // 构建动态更新语句
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.endTime !== undefined) {
        updateFields.push(`end_time = $${paramIndex++}`);
        values.push(updates.endTime);
      }

      if (updates.status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }

      if (updates.result !== undefined) {
        updateFields.push(`result = $${paramIndex++}`);
        values.push(JSON.stringify(updates.result));
      }

      if (updates.errorMessage !== undefined) {
        updateFields.push(`error_message = $${paramIndex++}`);
        values.push(updates.errorMessage);
      }

      if (updates.executionTimeMs !== undefined) {
        updateFields.push(`execution_time_ms = $${paramIndex++}`);
        values.push(updates.executionTimeMs);
      }

      if (updateFields.length === 0) {
        addLog.warn(`没有需要更新的字段: ${id}`);
        return;
      }

      // 添加 ID 参数
      values.push(id);

      const sql = `UPDATE task_executions SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`;

      const result = await client.query(sql, values);

      if (!result.rowCount || result.rowCount === 0) {
        throw new TaskError(TaskErrorType.DATABASE_ERROR, `执行记录不存在: ${id}`);
      }

      addLog.info(`执行记录已更新: ${id}`);
    } catch (error) {
      if (error instanceof TaskError) {
        throw error;
      }
      addLog.error(`更新执行记录失败: ${id}`, error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, `更新执行记录失败: ${id}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * 查询执行历史
   * 支持分页和筛选
   */
  async queryExecutions(options: QueryOptions = {}): Promise<{
    total: number;
    executions: TaskExecution[];
  }> {
    const client = await this.pool.connect();

    try {
      const { taskId, status, startTime, endTime, page = 1, pageSize = 20 } = options;

      // 构建查询条件
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (taskId) {
        conditions.push(`task_id = $${paramIndex++}`);
        values.push(taskId);
      }

      if (status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(status);
      }

      if (startTime) {
        conditions.push(`start_time >= $${paramIndex++}`);
        values.push(startTime);
      }

      if (endTime) {
        conditions.push(`start_time <= $${paramIndex++}`);
        values.push(endTime);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // 查询总数
      const countSql = `SELECT COUNT(*) as total FROM task_executions ${whereClause}`;
      const countResult = await client.query(countSql, values);
      const total = parseInt(countResult.rows[0].total, 10);

      // 查询数据（分页）
      const offset = (page - 1) * pageSize;
      const dataSql = `
        SELECT
          id, task_id, task_name, start_time, end_time,
          status, params, result, error_message,
          execution_time_ms, created_at
        FROM task_executions
        ${whereClause}
        ORDER BY start_time DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      const dataValues = [...values, pageSize, offset];
      const dataResult = await client.query(dataSql, dataValues);

      // 转换数据格式
      const executions: TaskExecution[] = dataResult.rows.map((row: TaskExecutionDB) => ({
        id: row.id,
        taskId: row.task_id,
        taskName: row.task_name,
        startTime: row.start_time,
        endTime: row.end_time || undefined,
        status: row.status,
        params: row.params || undefined,
        result: row.result || undefined,
        errorMessage: row.error_message || undefined,
        executionTimeMs: row.execution_time_ms || undefined,
        createdAt: row.created_at || undefined
      }));

      return { total, executions };
    } catch (error) {
      addLog.error('查询执行历史失败', error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, '查询执行历史失败', error);
    } finally {
      client.release();
    }
  }

  /**
   * 获取任务锁
   * 使用 PostgreSQL 的 advisory lock 实现分布式锁
   * 返回 true 表示成功获取锁，false 表示锁已被占用
   */
  async acquireLock(taskId: string): Promise<boolean> {
    const client = await this.pool.connect();

    try {
      // 将任务 ID 转换为数字（使用哈希函数）
      const lockId = this.hashTaskId(taskId);

      // 尝试获取 advisory lock（非阻塞）
      // pg_try_advisory_lock 返回 true 表示成功获取锁，false 表示锁已被占用
      const result = await client.query('SELECT pg_try_advisory_lock($1) as acquired', [lockId]);

      const acquired = result.rows[0].acquired;

      if (acquired) {
        addLog.info(`任务锁已获取: ${taskId} (lockId: ${lockId})`);
      } else {
        addLog.warn(`任务锁获取失败，任务正在运行: ${taskId}`);
      }

      return acquired;
    } catch (error) {
      addLog.error(`获取任务锁失败: ${taskId}`, error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, `获取任务锁失败: ${taskId}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * 释放任务锁
   */
  async releaseLock(taskId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      // 将任务 ID 转换为数字
      const lockId = this.hashTaskId(taskId);

      // 释放 advisory lock
      await client.query('SELECT pg_advisory_unlock($1)', [lockId]);

      addLog.info(`任务锁已释放: ${taskId} (lockId: ${lockId})`);
    } catch (error) {
      addLog.error(`释放任务锁失败: ${taskId}`, error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, `释放任务锁失败: ${taskId}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * 将任务 ID 转换为数字（用于 advisory lock）
   * 使用简单的哈希函数将字符串转换为 32 位整数
   */
  private hashTaskId(taskId: string): number {
    let hash = 0;
    for (let i = 0; i < taskId.length; i++) {
      const char = taskId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为 32 位整数
    }
    // 确保返回正数
    return Math.abs(hash);
  }

  /**
   * 获取任务配置
   */
  async getTaskConfig(taskId: string): Promise<TaskConfigDB | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT
          id, name, description, cron_expression, timezone,
          enabled, executor_name, default_params,
          max_execution_time, retry_count, retry_interval,
          created_at, updated_at
        FROM task_configs
        WHERE id = $1`,
        [taskId]
      );

      if (!result.rowCount || result.rowCount === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      addLog.error(`获取任务配置失败: ${taskId}`, error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, `获取任务配置失败: ${taskId}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * 获取所有启用的任务配置
   */
  async getEnabledTaskConfigs(): Promise<TaskConfigDB[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT
          id, name, description, cron_expression, timezone,
          enabled, executor_name, default_params,
          max_execution_time, retry_count, retry_interval,
          created_at, updated_at
        FROM task_configs
        WHERE enabled = true
        ORDER BY name`
      );

      return result.rows;
    } catch (error) {
      addLog.error('获取启用的任务配置失败', error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, '获取启用的任务配置失败', error);
    } finally {
      client.release();
    }
  }

  /**
   * 获取所有任务配置
   */
  async getAllTaskConfigs(): Promise<TaskConfigDB[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT
          id, name, description, cron_expression, timezone,
          enabled, executor_name, default_params,
          max_execution_time, retry_count, retry_interval,
          created_at, updated_at
        FROM task_configs
        ORDER BY name`
      );

      return result.rows;
    } catch (error) {
      addLog.error('获取所有任务配置失败', error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, '获取所有任务配置失败', error);
    } finally {
      client.release();
    }
  }

  /**
   * 获取任务的最近一次执行记录
   */
  async getLastExecution(taskId: string): Promise<TaskExecution | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT
          id, task_id, task_name, start_time, end_time,
          status, params, result, error_message,
          execution_time_ms, created_at
        FROM task_executions
        WHERE task_id = $1
        ORDER BY start_time DESC
        LIMIT 1`,
        [taskId]
      );

      if (!result.rowCount || result.rowCount === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        taskId: row.task_id,
        taskName: row.task_name,
        startTime: row.start_time,
        endTime: row.end_time || undefined,
        status: row.status,
        params: row.params || undefined,
        result: row.result || undefined,
        errorMessage: row.error_message || undefined,
        executionTimeMs: row.execution_time_ms || undefined,
        createdAt: row.created_at || undefined
      };
    } catch (error) {
      addLog.error(`获取最近执行记录失败: ${taskId}`, error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, `获取最近执行记录失败: ${taskId}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * 根据执行 ID 获取执行记录详情
   */
  async getExecutionById(executionId: number): Promise<TaskExecution | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT
          id, task_id, task_name, start_time, end_time,
          status, params, result, error_message,
          execution_time_ms, created_at
        FROM task_executions
        WHERE id = $1`,
        [executionId]
      );

      if (!result.rowCount || result.rowCount === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        taskId: row.task_id,
        taskName: row.task_name,
        startTime: row.start_time,
        endTime: row.end_time || undefined,
        status: row.status,
        params: row.params || undefined,
        result: row.result || undefined,
        errorMessage: row.error_message || undefined,
        executionTimeMs: row.execution_time_ms || undefined,
        createdAt: row.created_at || undefined
      };
    } catch (error) {
      addLog.error(`获取执行记录详情失败: ${executionId}`, error as Error);
      throw new TaskError(
        TaskErrorType.DATABASE_ERROR,
        `获取执行记录详情失败: ${executionId}`,
        error
      );
    } finally {
      client.release();
    }
  }
}
