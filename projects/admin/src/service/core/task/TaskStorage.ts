/**
 * 任务存储层
 * 负责任务配置和执行历史的数据库操作
 */

import type { Pool, PoolClient } from 'pg';
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

/** 已持有的任务锁：锁 Id 与持有该会话连接的客户端（必须同连接解锁） */
export interface HeldTaskLock {
  lockId: number;
  client: PoolClient;
}

/** 服务重启导致执行中断时写入的错误信息 */
export const RECOVERY_INTERRUPTED_MESSAGE = '服务重启，执行中断（可重新执行）';

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
   *
   * 注意：pg_try_advisory_lock 是**会话级**锁，锁属于获取它的那条连接。
   * 因此成功时必须返回持有连接（不归还连接池），由调用方在整个执行周期内持有，
   * 结束后通过 releaseLock 在**同一连接**上解锁。
   *
   * @returns 锁已持有则返回 { lockId, client }；锁被占用返回 null
   */
  async acquireLock(taskId: string): Promise<HeldTaskLock | null> {
    const client = await this.pool.connect();

    try {
      // 将任务 ID 转换为数字（使用哈希函数）
      const lockId = this.hashTaskId(taskId);

      // 尝试获取 advisory lock（非阻塞）
      const result = await client.query('SELECT pg_try_advisory_lock($1) as acquired', [lockId]);
      const acquired = result.rows[0].acquired;

      if (!acquired) {
        client.release();
        addLog.warn(`任务锁获取失败，任务正在运行: ${taskId}`);
        return null;
      }

      addLog.info(`任务锁已获取: ${taskId} (lockId: ${lockId})`);
      return { lockId, client };
    } catch (error) {
      client.release();
      addLog.error(`获取任务锁失败: ${taskId}`, error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, `获取任务锁失败: ${taskId}`, error);
    }
  }

  /**
   * 释放任务锁
   * 必须在持有连接上解锁（会话级锁），解锁后归还连接。
   * 释放失败仅记录告警，不抛出（避免掩盖执行结果）。
   */
  async releaseLock(held: HeldTaskLock): Promise<void> {
    try {
      const result = await held.client.query('SELECT pg_advisory_unlock($1) as released', [
        held.lockId
      ]);

      if (result.rows[0]?.released) {
        addLog.info(`任务锁已释放 (lockId: ${held.lockId})`);
      } else {
        addLog.warn(`任务锁释放失败：当前会话未持有该锁 (lockId: ${held.lockId})`);
      }
    } catch (error) {
      addLog.error(`释放任务锁失败 (lockId: ${held.lockId})`, error as Error);
    } finally {
      held.client.release();
    }
  }

  /**
   * 探测任务锁是否可获取（获取后立即释放）
   * 用于重启恢复时判断「是否有实例正在执行该任务」
   */
  async probeLock(taskId: string): Promise<boolean> {
    const client = await this.pool.connect();

    try {
      const lockId = this.hashTaskId(taskId);
      const result = await client.query('SELECT pg_try_advisory_lock($1) as acquired', [lockId]);

      if (!result.rows[0]?.acquired) {
        return false;
      }

      await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
      return true;
    } catch (error) {
      addLog.error(`探测任务锁失败: ${taskId}`, error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, `探测任务锁失败: ${taskId}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * 恢复遗留的 running 执行记录（服务启动时调用）
   *
   * 对每条 running 记录按任务维度加锁：
   * - 加锁成功：没有任何实例在执行该任务（多为本服务重启遗留），标记为 failed 并释放
   * - 加锁失败：其他实例仍在执行，保持原状态，避免误杀
   *
   * @returns 被标记为 failed 的记录数
   */
  async recoverStaleExecutions(): Promise<number> {
    let recoveredCount = 0;

    try {
      // 按任务去重，避免重复加锁
      const runningTasksResult = await this.pool.query(
        'SELECT DISTINCT task_id FROM task_executions WHERE status = $1',
        ['running']
      );
      const taskIds: string[] = runningTasksResult.rows.map((row) => row.task_id);

      for (const taskId of taskIds) {
        const held = await this.acquireLock(taskId);
        if (!held) {
          addLog.info(`任务仍由其他实例执行，跳过遗留记录恢复: ${taskId}`);
          continue;
        }

        try {
          const result = await this.pool.query(
            `UPDATE task_executions
             SET status = $1, end_time = $2, error_message = $3
             WHERE task_id = $4 AND status = $5`,
            ['failed', new Date(), RECOVERY_INTERRUPTED_MESSAGE, taskId, 'running']
          );

          recoveredCount += result.rowCount || 0;
          addLog.warn(`遗留 running 记录已标记失败: ${taskId} (${result.rowCount || 0} 条)`);
        } finally {
          await this.releaseLock(held);
        }
      }

      addLog.info(`遗留执行记录恢复完成，共标记 ${recoveredCount} 条`);
      return recoveredCount;
    } catch (error) {
      addLog.error('恢复遗留执行记录失败', error as Error);
      throw new TaskError(TaskErrorType.DATABASE_ERROR, '恢复遗留执行记录失败', error);
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
