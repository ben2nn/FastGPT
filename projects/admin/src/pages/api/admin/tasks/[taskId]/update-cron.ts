/**
 * 更新任务配置 API
 * POST /api/admin/tasks/:taskId/update-cron
 *
 * 功能：更新指定任务的配置（Cron 表达式、参数、描述）
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';
import cron from 'node-cron';

import { NextAPI } from '@/service/middleware/entry';
import { getTaskManager } from '@/service/core/task/instance';

/**
 * 请求参数类型
 */
export type UpdateCronRequestBody = {
  cronExpression?: string;
  params?: Record<string, any>;
  description?: string;
};

/**
 * 响应类型
 */
export type UpdateCronResponse = {
  success: boolean;
  message: string;
  nextExecutionTime: string | null;
};

/**
 * 更新任务配置 API 处理函数
 */
async function handler(
  req: ApiRequestProps<UpdateCronRequestBody, { taskId: string }>,
  res: ApiResponseType<UpdateCronResponse>
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
    const { cronExpression, params, description } = req.body;

    if (!taskId) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: '缺少必要参数: taskId'
      } as any);
    }

    // 至少需要提供一个更新字段
    if (!cronExpression && !params && description === undefined) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: '至少需要提供一个更新字段'
      } as any);
    }

    // 3. 验证 cron 表达式（如果提供）
    if (cronExpression && !cron.validate(cronExpression)) {
      return res.status(400).json({
        code: 'INVALID_CRON',
        message: 'Cron 表达式格式无效'
      } as any);
    }

    // 4. 获取 TaskManager 实例
    const taskManager = await getTaskManager();

    // 5. 获取任务配置
    const config = taskManager.getTaskConfig(taskId);
    if (!config) {
      return res.status(404).json({
        code: 'TASK_NOT_FOUND',
        message: `任务不存在: ${taskId}`
      } as any);
    }

    // 6. 统一更新任务配置
    await taskManager.updateTaskConfig(taskId, {
      description,
      cronExpression,
      params
    });

    // 7. 如果更新了 Cron 表达式且任务已启用，重新启动调度
    if (cronExpression && config.enabled) {
      await taskManager.startTask(taskId);
    }

    // 8. 获取下次执行时间
    const nextExecutionTime = taskManager.getNextExecutionTime(taskId);

    // 构建更新消息
    const updates: string[] = [];
    if (description !== undefined) updates.push('任务描述');
    if (cronExpression) updates.push('Cron 表达式');
    if (params) updates.push('任务参数');

    addLog.info('[UpdateTaskConfigAPI] 任务配置更新成功', {
      taskId,
      cronExpression,
      params,
      description,
      updates
    });

    return res.status(200).json({
      success: true,
      message: updates.length > 0 ? `${updates.join('、')}更新成功` : '任务配置更新成功',
      nextExecutionTime: nextExecutionTime ? nextExecutionTime.toISOString() : null
    });
  } catch (error) {
    addLog.error('[UpdateTaskConfigAPI] 更新失败', error as Error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '更新失败，请稍后重试',
      details: { error: error instanceof Error ? error.message : String(error) }
    } as any);
  }
}

export default NextAPI(handler);
