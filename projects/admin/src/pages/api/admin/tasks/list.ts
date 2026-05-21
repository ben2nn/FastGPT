/**
 * 任务列表 API
 * GET /api/admin/tasks/list
 *
 * 功能：获取所有任务配置列表，包含每个任务的下次执行时间和最近执行状态
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { getTaskManager } from '@/service/core/task/instance';
import type { TaskConfig, TaskExecution } from '@/types/task';

/**
 * 任务列表项类型
 */
export type TaskListItem = {
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
  nextExecutionTime: string | null;
  lastExecution: {
    id: number;
    status: string;
    startTime: string;
    endTime?: string;
    executionTimeMs?: number;
    errorMessage?: string;
  } | null;
  isRunning: boolean;
};

/**
 * 响应类型
 */
export type TaskListResponse = {
  tasks: TaskListItem[];
  total: number;
};

/**
 * 任务列表 API 处理函数
 */
async function handler(req: ApiRequestProps, res: ApiResponseType<TaskListResponse>) {
  const startTime = Date.now();

  try {
    // 1. 验证请求方法
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({
        code: 'METHOD_NOT_ALLOWED',
        message: '方法不允许，仅支持 GET 请求'
      } as any);
    }

    // 2. 权限验证（TODO: 添加管理员权限验证）
    // const { userId } = await authCert({ req, authToken: true });
    // if (!isAdmin(userId)) {
    //   return res.status(403).json({
    //     code: 'FORBIDDEN',
    //     message: '无权访问，需要管理员权限'
    //   } as any);
    // }

    // 3. 获取 TaskManager 实例
    let taskManager;
    try {
      taskManager = await getTaskManager();
    } catch (error) {
      addLog.error('[TaskListAPI] 获取 TaskManager 实例失败', error as Error);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: '任务管理器初始化失败，请稍后重试'
      } as any);
    }

    // 4. 获取所有任务配置
    const configs = taskManager.getAllTaskConfigs();

    // 5. 为每个任务获取额外信息
    const tasks: TaskListItem[] = await Promise.all(
      configs.map(async (config) => {
        // 获取下次执行时间
        const nextExecutionTime = taskManager.getNextExecutionTime(config.id);

        // 获取最近一次执行记录
        let lastExecution: TaskListItem['lastExecution'] = null;
        try {
          const execution = await taskManager.getLastExecution(config.id);
          if (execution) {
            lastExecution = {
              id: execution.id,
              status: execution.status,
              startTime: execution.startTime.toISOString(),
              endTime: execution.endTime?.toISOString(),
              executionTimeMs: execution.executionTimeMs,
              errorMessage: execution.errorMessage
            };
          }
        } catch (error) {
          addLog.warn(`[TaskListAPI] 获取任务 ${config.id} 的最近执行记录失败`, {
            error: error instanceof Error ? error.message : String(error)
          });
        }

        // 检查任务是否正在运行
        const isRunning = taskManager.isTaskRunning(config.id);

        return {
          id: config.id,
          name: config.name,
          description: config.description,
          cronExpression: config.cronExpression,
          timezone: config.timezone,
          enabled: config.enabled,
          executorName: config.executorName,
          defaultParams: config.defaultParams,
          maxExecutionTime: config.maxExecutionTime,
          retryCount: config.retryCount,
          retryInterval: config.retryInterval,
          nextExecutionTime: nextExecutionTime ? nextExecutionTime.toISOString() : null,
          lastExecution,
          isRunning
        };
      })
    );

    // 6. 返回结果
    const result: TaskListResponse = {
      tasks,
      total: tasks.length
    };

    addLog.info('[TaskListAPI] 任务列表查询成功', {
      total: result.total,
      duration: `${Date.now() - startTime}ms`
    });

    return res.status(200).json(result);
  } catch (error) {
    addLog.error('[TaskListAPI] 未知错误', error as Error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误，请稍后重试',
      details: { error: error instanceof Error ? error.message : String(error) }
    } as any);
  }
}

export default NextAPI(handler);
