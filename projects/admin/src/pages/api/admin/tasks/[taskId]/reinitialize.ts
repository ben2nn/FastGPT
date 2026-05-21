/**
 * 重新初始化任务 API
 * POST /api/admin/tasks/:taskId/reinitialize
 *
 * 功能：重新初始化指定任务（重新加载配置并重启调度）
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { getTaskManager } from '@/service/core/task/instance';

/**
 * 响应类型
 */
export type ReinitializeResponse = {
  success: boolean;
  message: string;
  nextExecutionTime: string | null;
};

/**
 * 重新初始化任务 API 处理函数
 */
async function handler(
  req: ApiRequestProps<{}, { taskId: string }>,
  res: ApiResponseType<ReinitializeResponse>
) {
  try {
    // 1. 验证请求方法
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({
        code: 'METHOD_NOT_ALLOWED',
        message: '方法不允许，仅支持 POST 请求'
      } as any);
    }

    // 2. 解析参数
    const { taskId } = req.query;

    if (!taskId) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: '缺少必要参数: taskId'
      } as any);
    }

    // 3. 获取 TaskManager 实例
    const taskManager = await getTaskManager();

    // 4. 获取任务配置
    const config = taskManager.getTaskConfig(taskId);
    if (!config) {
      return res.status(404).json({
        code: 'TASK_NOT_FOUND',
        message: `任务不存在: ${taskId}`
      } as any);
    }

    // 5. 停止任务
    taskManager.stopTask(taskId);

    // 6. 如果任务已启用，重新启动
    if (config.enabled) {
      await taskManager.startTask(taskId);
    }

    // 7. 获取下次执行时间
    const nextExecutionTime = taskManager.getNextExecutionTime(taskId);

    addLog.info('[ReinitializeAPI] 任务重新初始化成功', {
      taskId,
      enabled: config.enabled
    });

    return res.status(200).json({
      success: true,
      message: '任务重新初始化成功',
      nextExecutionTime: nextExecutionTime ? nextExecutionTime.toISOString() : null
    });
  } catch (error) {
    addLog.error('[ReinitializeAPI] 重新初始化失败', error as Error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '重新初始化失败，请稍后重试',
      details: { error: error instanceof Error ? error.message : String(error) }
    } as any);
  }
}

export default NextAPI(handler);
