/**
 * PostgreSQL 连接池管理
 * 负责管理全局 PostgreSQL 连接池
 */

import { Pool } from 'pg';
import { addLog } from '@fastgpt/service/common/system/log';
import { SystemError, ErrorType } from '@/service/common/errors';

// 全局连接池实例
declare global {
  var __postgresPool: Pool | undefined;
}

// 保活定时器
let keepAliveInterval: NodeJS.Timeout | null = null;

/**
 * 启动连接池保活机制
 * 定期发送简单查询防止连接因空闲而断开
 */
function startKeepAlive(pool: Pool) {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  // 每 60 秒执行一次保活查询
  keepAliveInterval = setInterval(async () => {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
    } catch (error) {
      addLog.warn('PostgreSQL 保活查询失败:', error);
    }
  }, 60000);

  // 防止定时器阻止进程退出
  if (keepAliveInterval.unref) {
    keepAliveInterval.unref();
  }

  addLog.info('PostgreSQL 保活机制已启动（每 60 秒）');
}

/**
 * 获取或创建全局 PostgreSQL 连接池
 * 统一管理连接池，避免重复创建
 */
export function getPostgresPool(): Pool {
  if (!global.__postgresPool) {
    // 从环境变量获取连接字符串（统计数据用）
    const connectionString = process.env.PG_STATS_URL || process.env.PG_URL;

    if (!connectionString) {
      throw new SystemError(ErrorType.CONFIGURATION_ERROR, 'PG_STATS_URL 或 PG_URL 环境变量未设置');
    }

    // 获取最大连接数配置
    const maxConnections = process.env.POSTGRES_MAX_CONNECTIONS
      ? parseInt(process.env.POSTGRES_MAX_CONNECTIONS, 10)
      : 20;

    addLog.info('创建全局 PostgreSQL 连接池', {
      maxConnections
    });

    global.__postgresPool = new Pool({
      connectionString,
      max: maxConnections,
      idleTimeoutMillis: 300000, // 5 分钟空闲超时，与 MongoDB 保持一致
      connectionTimeoutMillis: 10000
    });

    // 监听连接池错误
    global.__postgresPool.on('error', (err) => {
      addLog.error('PostgreSQL 连接池错误', err);
    });

    // 启动保活机制
    startKeepAlive(global.__postgresPool);

    addLog.info('PostgreSQL 连接池创建成功');
  }

  return global.__postgresPool;
}

/**
 * 测试数据库连接
 */
export async function testConnection(): Promise<boolean> {
  try {
    const pool = getPostgresPool();
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    addLog.info('PostgreSQL 连接测试成功');
    return true;
  } catch (error) {
    addLog.error('PostgreSQL 连接测试失败', error as Error);
    return false;
  }
}

/**
 * PostgreSQL 健康检查
 */
export async function checkPostgresHealth(): Promise<{ connected: boolean; latency: number }> {
  try {
    const pool = getPostgresPool();
    const startTime = Date.now();
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    const latency = Date.now() - startTime;

    return { connected: true, latency };
  } catch (error) {
    addLog.error('PostgreSQL 健康检查失败', error as Error);
    return { connected: false, latency: -1 };
  }
}

/**
 * 关闭全局连接池
 */
export async function closePostgresPool(): Promise<void> {
  if (global.__postgresPool) {
    addLog.info('关闭全局 PostgreSQL 连接池');
    await global.__postgresPool.end();
    global.__postgresPool = undefined;
    addLog.info('PostgreSQL 连接池已关闭');
  }
}
