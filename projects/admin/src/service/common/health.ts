/**
 * 健康检查 API
 * GET /api/health
 *
 * 返回系统健康状态，包括：
 * - MongoDB 连接状态和延迟
 * - PostgreSQL 连接状态和延迟
 * - 定时任务状态和下次执行时间
 * - 最后一次执行的结果
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/common/mongo';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { checkPostgresHealth } from '@/service/common/postgres';
import type { HealthResponse } from '@/types/index';
import { addLog } from '@fastgpt/service/common/system/log';

/**
 * 检查 MongoDB 连接状态和延迟
 */
async function checkMongoDBHealth(): Promise<{ connected: boolean; latency: number }> {
  try {
    const startTime = Date.now();

    // 确保已连接
    await connectToDatabase();

    // 使用 @fastgpt/service 的 MongoDB 连接
    const db = connectionMongo;

    // 检查连接是否存在
    if (!db.connection.db) {
      return {
        connected: false,
        latency: -1
      };
    }

    // 执行简单的 ping 命令测试连接
    await db.connection.db.admin().ping();

    const latency = Date.now() - startTime;

    return {
      connected: db.connection.readyState === 1, // 1 表示已连接
      latency
    };
  } catch (error) {
    addLog.error('MongoDB 健康检查失败:', error);
    return {
      connected: false,
      latency: -1
    };
  }
}

/**
 * 检查 PostgreSQL 连接状态和延迟
 */
async function checkPostgres(): Promise<{ connected: boolean; latency: number }> {
  try {
    // 直接使用 postgres 模块的健康检查函数
    const result = await checkPostgresHealth();
    return result;
  } catch (error) {
    addLog.error('PostgreSQL 健康检查失败:', error);
    return {
      connected: false,
      latency: -1
    };
  }
}

/**
 * 获取任务管理器状态
 */
async function getTaskManagerStatus(): Promise<{
  initialized: boolean;
  registeredTasks: number;
  runningTasks: string[];
  enabledTasks: number;
} | null> {
  try {
    // 动态导入以避免循环依赖
    const { isTaskManagerInitialized, getTaskManager } = await import('../core/task/instance');

    if (!isTaskManagerInitialized()) {
      return {
        initialized: false,
        registeredTasks: 0,
        runningTasks: [],
        enabledTasks: 0
      };
    }

    const taskManager = await getTaskManager();

    // 获取所有任务配置
    const allConfigs = taskManager.getAllTaskConfigs();

    // 获取启用的任务数量
    const enabledTasks = allConfigs.filter((config) => config.enabled).length;

    // 获取正在运行的任务
    const runningTasks = taskManager.getRunningTasks();

    return {
      initialized: true,
      registeredTasks: allConfigs.length,
      runningTasks,
      enabledTasks
    };
  } catch (error) {
    addLog.error('获取任务管理器状态失败:', error);
    return null;
  }
}

export default async function handler(req: ApiRequestProps, res: ApiResponseType<HealthResponse>) {
  if (req.method !== 'GET') {
    return jsonRes(res, {
      code: 405,
      error: '方法不允许，仅支持 GET 请求'
    });
  }

  try {
    // 1. 检查 MongoDB 健康状态
    const mongoHealth = await checkMongoDBHealth();

    // 2. 检查 PostgreSQL 健康状态
    const postgresHealth = await checkPostgres();

    // 3. 获取任务管理器状态
    const taskManagerStatus = await getTaskManagerStatus();

    // 4. 获取调度器状态（从任务管理器）
    let schedulerEnabled = false;
    let nextExecution = 'N/A';
    let lastExecution = null;

    if (taskManagerStatus && taskManagerStatus.initialized) {
      try {
        const { getTaskManager } = await import('../core/task/instance');
        const taskManager = await getTaskManager();

        // 获取所有启用的任务
        const enabledConfigs = taskManager.getAllTaskConfigs().filter((config) => config.enabled);

        schedulerEnabled = enabledConfigs.length > 0;

        // 获取最近的下次执行时间
        if (enabledConfigs.length > 0) {
          const nextTimes = enabledConfigs
            .map((config) => taskManager.getNextExecutionTime(config.id))
            .filter((time): time is Date => time !== null)
            .sort((a, b) => a.getTime() - b.getTime());

          if (nextTimes.length > 0) {
            nextExecution = nextTimes[0].toISOString();
          }
        }

        // 获取最近一次执行记录
        const history = await taskManager.getExecutionHistory(undefined, {
          page: 1,
          pageSize: 1
        });

        if (history.executions.length > 0) {
          const exec = history.executions[0];
          lastExecution = {
            time: exec.endTime?.toISOString() || exec.startTime.toISOString(),
            status: exec.status,
            recordsProcessed: 0, // 任务管理器不跟踪记录数
            executionTime: exec.executionTimeMs || 0,
            errors: exec.errorMessage ? [exec.errorMessage] : []
          };
        }
      } catch (error) {
        addLog.warn('获取调度器详细信息失败', error as Error);
      }
    }

    // 5. 确定整体健康状态
    const isHealthy = mongoHealth.connected && postgresHealth.connected;

    // 6. 构建响应
    const response: HealthResponse = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      mongodb: mongoHealth,
      postgres: postgresHealth,
      scheduler: {
        enabled: schedulerEnabled,
        nextExecution
      },
      taskManager: taskManagerStatus || undefined,
      lastExecution
    };

    return jsonRes(res, {
      data: response
    });
  } catch (error) {
    addLog.error('健康检查失败:', error);

    return jsonRes(res, {
      code: 500,
      error: '健康检查失败: ' + (error instanceof Error ? error.message : String(error))
    });
  }
}
