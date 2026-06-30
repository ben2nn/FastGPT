/**
 * 手动执行任务 API
 * POST /api/admin/tasks/:taskId/execute
 *
 * 功能：手动立即执行指定任务，可选择性传入参数覆盖默认参数
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { getTaskManager } from '@/service/core/task/instance';
import { TaskError, TaskErrorType } from '@/service/common/errors';
import type { TaskResult } from '@/types/task';

/**
 * 查询参数类型
 */
export type TaskExecuteQueryParams = {
  taskId: string;
};

/**
 * 请求体类型
 */
export type TaskExecuteBody = {
  params?: Record<string, any>;
};

/**
 * 响应类型
 */
export type TaskExecuteResponse = {
  success: boolean;
  taskId: string;
  result: TaskResult;
  message: string;
};

/**
 * 手动执行任务 API 处理函数
 */
async function handler(
  req: ApiRequestProps<TaskExecuteBody, TaskExecuteQueryParams>,
  res: ApiResponseType<TaskExecuteResponse>
) {
  const startTime = Date.now();

  try {
    // 1. 验证请求方法
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({
        code: 'METHOD_NOT_ALLOWED',
        message: '方法不允许，仅支持 POST 请求'
      } as any);
    }

    // 2. 管理员认证
    await authAdmin(req);

    // 3. 解析参数
    const { taskId } = req.query;
    const { params } = req.body || {};

    if (!taskId) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: '缺少必要参数: taskId'
      } as any);
    }

    // 4. 获取 TaskManager 实例
    let taskManager;
    try {
      taskManager = await getTaskManager();
    } catch (error) {
      addLog.error('[TaskExecuteAPI] 获取 TaskManager 实例失败', error as Error);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: '任务管理器初始化失败，请稍后重试'
      } as any);
    }

    // 5. 检查任务是否存在
    const config = taskManager.getTaskConfig(taskId);
    if (!config) {
      addLog.warn('[TaskExecuteAPI] 任务不存在', { taskId });
      return res.status(404).json({
        code: 'TASK_NOT_FOUND',
        message: `任务不存在: ${taskId}`
      } as any);
    }

    // 6. 执行任务
    addLog.info('[TaskExecuteAPI] 开始手动执行任务', {
      taskId,
      hasCustomParams: !!params
    });

    try {
      const result = await taskManager.executeTask(taskId, params);

      const response: TaskExecuteResponse = {
        success: result.success,
        taskId,
        result,
        message: result.success ? '任务执行成功' : '任务执行失败'
      };

      addLog.info('[TaskExecuteAPI] 任务执行完成', {
        taskId,
        success: result.success,
        duration: `${Date.now() - startTime}ms`
      });

      return res.status(200).json(response);
    } catch (error) {
      if (error instanceof TaskError) {
        addLog.error('[TaskExecuteAPI] 任务执行失败', {
          taskId,
          errorType: error.type,
          errorMessage: error.message
        });

        let statusCode = 500;
        let message = error.message;

        switch (error.type) {
          case TaskErrorType.CONFIG_NOT_FOUND:
            statusCode = 404;
            break;
          case TaskErrorType.TASK_ALREADY_RUNNING:
            statusCode = 409; // Conflict
            message = '任务正在运行中，请稍后再试';
            break;
          case TaskErrorType.TASK_TIMEOUT:
            statusCode = 504; // Gateway Timeout
            break;
          case TaskErrorType.PARAMETER_INVALID:
            statusCode = 400;
            break;
          case TaskErrorType.TASK_EXECUTION_FAILED:
          case TaskErrorType.DATABASE_ERROR:
          default:
            statusCode = 500;
            break;
        }

        return res.status(statusCode).json({
          code: error.type,
          message,
          details: error.details
        } as any);
      }

      throw error;
    }
  } catch (error) {
    addLog.error('[TaskExecuteAPI] 未知错误', error as Error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误，请稍后重试',
      details: { error: error instanceof Error ? error.message : String(error) }
    } as any);
  }
}

export default NextAPI(handler);
