/**
 * 任务系统初始化编排
 * 负责管理初始化状态，协调各子模块的初始化流程
 *
 * 包含：PostgreSQL 表结构创建、任务配置加载、任务管理器启动、初始化状态管理
 */

import { addLog } from '@fastgpt/service/common/system/log';
import { testConnection } from '@/service/common/postgres';
import { getPostgresPool } from '@/service/common/postgres';
import { getSchemaStatements } from '@/service/sql';
import { SystemError, ErrorType } from '@/service/common/errors';
import { DEFAULT_TIMEZONE } from '@/web/common/constants';

// ==================== 初始化状态管理 ====================

// 初始化状态枚举
export enum InitializationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// 全局初始化状态
interface InitializationState {
  status: InitializationStatus;
  error?: Error;
  startTime?: Date;
  endTime?: Date;
  initPromise?: Promise<void>;
}

declare global {
  var __initializationState: InitializationState | undefined;
}

// 初始化全局状态（惰性初始化，确保首次访问时已存在）
if (typeof window === 'undefined' && !global.__initializationState) {
  global.__initializationState = {
    status: InitializationStatus.PENDING
  };
}

/**
 * 获取初始化状态
 */
export function getInitializationStatus(): InitializationState {
  if (typeof window !== 'undefined') {
    return { status: InitializationStatus.COMPLETED };
  }
  return global.__initializationState || { status: InitializationStatus.PENDING };
}

/**
 * 等待初始化完成
 * 如果初始化尚未开始，则启动初始化；如果已失败则抛出错误
 */
export async function ensureInitialized(): Promise<void> {
  if (typeof window !== 'undefined') {
    return;
  }
  // initializeDatabase() 内部已有完整的状态守卫（COMPLETED/IN_PROGRESS/FAILED）
  // 不需要外层重复检查，避免 TOCTOU 竞态
  await initializeDatabase();
}

// ==================== 数据库表结构创建 ====================

/**
 * 创建数据库表和索引
 */
export async function createTables(): Promise<void> {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    addLog.info('开始检查数据库表结构');

    // 检查所有必需的表是否已存在
    const requiredTables = ['model_call_logs', 'task_configs', 'task_executions'];
    const existingTables: string[] = [];

    for (const tableName of requiredTables) {
      const result = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )`,
        [tableName]
      );

      if (result.rows[0]?.exists) {
        existingTables.push(tableName);
      }
    }

    // 如果所有表都已存在，跳过创建
    if (existingTables.length === requiredTables.length) {
      addLog.info('所有数据库表已存在，跳过表结构创建');
      return;
    }

    // 如果部分表存在，记录日志
    if (existingTables.length > 0) {
      addLog.info(`已存在的表: ${existingTables.join(', ')}`);
    }

    addLog.info('开始创建数据库表');

    // 开始事务
    await client.query('BEGIN');

    // 从 SQL 文件加载并执行所有表结构语句
    const sqlStatements = getSchemaStatements();

    addLog.info(`准备执行 ${sqlStatements.length} 条 SQL 语句`);

    for (let i = 0; i < sqlStatements.length; i++) {
      const statement = sqlStatements[i];
      try {
        await client.query(statement);
        addLog.debug(`SQL 语句 ${i + 1}/${sqlStatements.length} 执行成功`);
      } catch (error) {
        addLog.error(`SQL 语句 ${i + 1} 执行失败`, error as Error);
        throw error;
      }
    }

    // 提交事务
    await client.query('COMMIT');
    addLog.info('数据库表结构创建成功，事务已提交');
  } catch (error) {
    // 回滚事务（连接丢失时 ROLLBACK 也可能失败，需独立捕获）
    try {
      await client.query('ROLLBACK');
      addLog.info('创建表失败，事务已回滚');
    } catch (rollbackError) {
      addLog.error('创建表事务回滚失败', rollbackError as Error);
    }
    addLog.error('创建表失败', error as Error);
    throw new SystemError(
      ErrorType.DATABASE_ERROR,
      `创建表失败: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  } finally {
    client.release();
  }
}

// ==================== 任务配置加载 ====================

/**
 * 加载初始任务配置到数据库
 */
export async function loadInitialTaskConfigs(): Promise<void> {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    addLog.info('开始检查任务配置表');

    // 检查任务配置表是否存在
    const tableExistsResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'task_configs'
      )
    `);

    if (!tableExistsResult.rows[0]?.exists) {
      throw new SystemError(ErrorType.DATABASE_ERROR, 'task_configs 表不存在，请先创建表结构');
    }

    // 检查任务配置表是否已有数据
    const countResult = await client.query('SELECT COUNT(*) as count FROM task_configs');
    const count = parseInt(countResult.rows[0]?.count || '0', 10);

    if (count > 0) {
      addLog.info(`任务配置表已有 ${count} 条记录，跳过初始化`);
      return;
    }

    // 动态导入 taskConfigs，避免循环依赖
    addLog.info('动态导入任务配置');
    const { taskConfigs } = await import('@/service/core/task/taskConfigs');

    addLog.info(`准备加载 ${taskConfigs.length} 个初始任务配置`);

    const now = new Date();

    // 开始事务
    await client.query('BEGIN');

    for (let i = 0; i < taskConfigs.length; i++) {
      const config = taskConfigs[i];
      try {
        await client.query(
          `INSERT INTO task_configs (
            id, name, description, cron_expression, timezone,
            enabled, executor_name, default_params,
            max_execution_time, retry_count, retry_interval,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO NOTHING`,
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

        addLog.info(
          `任务配置已加载 (${i + 1}/${taskConfigs.length}): ${config.id} - ${config.name}`
        );
      } catch (error) {
        addLog.error(`加载任务配置失败: ${config.id}`, error as Error);
        throw error;
      }
    }

    // 提交事务
    await client.query('COMMIT');

    addLog.info(`初始任务配置加载完成，共 ${taskConfigs.length} 个任务，事务已提交`);
  } catch (error) {
    // 回滚事务
    try {
      await client.query('ROLLBACK');
      addLog.info('任务配置加载失败，事务已回滚');
    } catch (rollbackError) {
      addLog.error('事务回滚失败', rollbackError as Error);
    }

    addLog.error('加载初始任务配置失败', error as Error);
    throw new SystemError(
      ErrorType.DATABASE_ERROR,
      `加载初始任务配置失败: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  } finally {
    client.release();
  }
}

// ==================== 任务管理器启动 ====================

/**
 * 初始化任务管理器
 * 在数据库表结构和任务配置加载完成后调用
 */
export async function initializeTaskManager(): Promise<void> {
  try {
    addLog.info('开始初始化任务管理器');

    // 动态导入 TaskManager，避免循环依赖
    const { getTaskManager } = await import('@/service/core/task/instance');

    // 获取并初始化 TaskManager 实例
    const taskManager = await getTaskManager();

    // 启动所有启用的任务
    await taskManager.startAll();

    addLog.info('任务管理器启动成功');
  } catch (error) {
    addLog.error('任务管理器初始化失败', error as Error);
    throw new SystemError(
      ErrorType.DATABASE_ERROR,
      `任务管理器初始化失败: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

// ==================== 初始化编排入口 ====================

/**
 * 初始化任务系统及配置
 * 创建表结构 → 加载任务配置 → 启动任务管理器
 *
 * 注意：MongoDB、S3、系统配置由 instrumentation.ts 负责，在此之前已就绪
 */
export async function initializeDatabase(): Promise<void> {
  if (typeof window !== 'undefined') {
    return;
  }

  // 惰性初始化全局状态（防止浏览器端先加载模块导致 undefined）
  if (!global.__initializationState) {
    global.__initializationState = { status: InitializationStatus.PENDING };
  }

  const state = global.__initializationState;

  // 已完成，直接返回
  if (state.status === InitializationStatus.COMPLETED) {
    return;
  }

  // 已失败，抛出错误供调用方处理
  if (state.status === InitializationStatus.FAILED) {
    throw state.error || new Error('初始化失败');
  }

  // 正在进行中，等待同一份 Promise（不存在 TOCTOU：单线程下 status 不会在检查后突变）
  if (state.initPromise) {
    return state.initPromise;
  }

  // 先赋值再创建 IIFE，确保 IIFE 同步执行时并发调用者已能通过 initPromise 等待
  const initPromise = (async () => {
    state.status = InitializationStatus.IN_PROGRESS;
    state.startTime = new Date();
    state.error = undefined;

    try {
      addLog.info('开始初始化系统');

      // 1. PostgreSQL 连接测试
      const connected = await testConnection();
      if (!connected) {
        throw new SystemError(ErrorType.POSTGRES_CONNECTION_ERROR, 'PostgreSQL 连接失败');
      }

      // 2. 创建表结构
      await createTables();
      addLog.info('PostgreSQL 初始化完成');

      // 3. 加载初始任务配置（依赖表结构）
      await loadInitialTaskConfigs();
      addLog.info('初始任务配置加载完成');

      // 4. 启动任务管理器（依赖任务配置）
      await initializeTaskManager();
      addLog.info('任务管理器初始化完成');

      state.status = InitializationStatus.COMPLETED;
      state.endTime = new Date();
      addLog.info(`系统初始化完成，耗时 ${state.endTime.getTime() - state.startTime!.getTime()}ms`);
    } catch (error) {
      state.status = InitializationStatus.FAILED;
      state.error = error as Error;
      state.endTime = new Date();
      addLog.error('系统初始化失败', error as Error);
      throw error;
    } finally {
      // 成功/失败后清除引用，释放内存（失败的等待者已通过 Promise rejection 收到错误）
      state.initPromise = undefined;
    }
  })();

  // 先赋值再返回，确保并发调用者能立即拿到同一个 Promise
  state.initPromise = initPromise;
  return initPromise;
}

/**
 * 重置初始化状态
 * 用于测试或强制重新初始化
 */
export function resetInitializationState(): void {
  if (typeof window === 'undefined') {
    global.__initializationState = {
      status: InitializationStatus.PENDING
    };
    addLog.info('系统初始化状态已重置');
  }
}
