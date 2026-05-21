/**
 * 任务启用/禁用 API
 * POST /api/admin/tasks/:taskId/toggle
 *
 * 功能：启用或禁用指定任务，启用时启动调度，禁用时停止调度
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { getTaskManager } from '@/service/core/task/instance';
import { TaskError, TaskErrorType } from '@/service/common/errors';

/**
 * 查询参数类型
 */
export type TaskToggleQueryParams = {
  taskId: string;
};

/**
 * 请求体类型
 */
export type TaskToggleBody = {
  enabled: boolean;
};

/**
 * 响应类型
 */
export type TaskToggleResponse = {
  success: boolean;
  taskId: string;
  enabled: boolean;
  message: string;
};

/**
 * 任务启用/禁用 API 处理函数
 */
async function handler(
  req: ApiRequestProps<TaskToggleBody, TaskToggleQueryParams>,
  res: ApiResponseType<TaskToggleResponse>
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

    // 2. 权限验证（TODO: 添加管理员权限验证）
    // const { userId } = await authCert({ req, authToken: true });
    // if (!isAdmin(userId)) {
    //   return res.status(403).json({
    //     code: 'FORBIDDEN',
    //     message: '无权访问，需要管理员权限'
    //   } as any);
    // }

    // 3. 解析参数
    const { taskId } = req.query;
    const { enabled } = req.body;

    if (!taskId) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: '缺少必要参数: taskId'
      } as any);
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: '参数 enabled 必须是布尔值'
      } as any);
    }

    // 4. 获取 TaskManager 实例
    let taskManager;
    try {
      taskManager = await getTaskManager();
    } catch (error) {
      addLog.error('[TaskToggleAPI] 获取 TaskManager 实例失败', error as Error);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: '任务管理器初始化失败，请稍后重试'
      } as any);
    }

    // 5. 检查任务是否存在
    const config = taskManager.getTaskConfig(taskId);
    if (!config) {
      addLog.warn('[TaskToggleAPI] 任务不存在', { taskId });
      return res.status(404).json({
        code: 'TASK_NOT_FOUND',
        message: `任务不存在: ${taskId}`
      } as any);
    }

    // 6. 更新任务状态
    try {
      await taskManager.toggleTask(taskId, enabled);

      const result: TaskToggleResponse = {
        success: true,
        taskId,
        enabled,
        message: enabled ? '任务已启用' : '任务已禁用'
      };

      addLog.info('[TaskToggleAPI] 任务状态更新成功', {
        taskId,
        enabled,
        duration: `${Date.now() - startTime}ms`
      });

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof TaskError) {
        addLog.error('[TaskToggleAPI] 任务状态更新失败', {
          taskId,
          enabled,
          errorType: error.type,
          errorMessage: error.message
        });

        let statusCode = 500;
        switch (error.type) {
          case TaskErrorType.CONFIG_NOT_FOUND:
            statusCode = 404;
            break;
          case TaskErrorType.DATABASE_ERROR:
            statusCode = 500;
            break;
          default:
            statusCode = 500;
            break;
        }

        return res.status(statusCode).json({
          code: error.type,
          message: error.message,
          details: error.details
        } as any);
      }

      throw error;
    }
  } catch (error) {
    addLog.error('[TaskToggleAPI] 未知错误', error as Error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误，请稍后重试',
      details: { error: error instanceof Error ? error.message : String(error) }
    } as any);
  }
}

export default NextAPI(handler);
