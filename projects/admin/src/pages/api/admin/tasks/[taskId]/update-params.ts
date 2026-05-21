/**
 * 更新任务参数 API
 * POST /api/admin/tasks/:taskId/update-params
 *
 * 功能：更新任务的默认参数配置
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { getTaskManager } from '@/service/core/task/instance';

/**
 * 请求参数类型
 */
export type UpdateParamsRequestBody = {
  params: Record<string, any>;
};

/**
 * 响应类型
 */
export type UpdateParamsResponse = {
  success: boolean;
  message: string;
};

/**
 * 更新任务参数 API 处理函数
 */
async function handler(
  req: ApiRequestProps<UpdateParamsRequestBody, { taskId: string }>,
  res: ApiResponseType<UpdateParamsResponse>
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
    const { params } = req.body;

    if (!taskId) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: '缺少必要参数: taskId'
      } as any);
    }

    if (!params || typeof params !== 'object') {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: '参数格式错误，必须是对象类型'
      } as any);
    }

    // 3. 获取 TaskManager 实例
    const taskManager = await getTaskManager();

    // 4. 更新任务参数
    await taskManager.updateTaskParams(taskId, params);

    addLog.info('[UpdateParamsAPI] 任务参数更新成功', {
      taskId,
      params
    });

    return res.status(200).json({
      success: true,
      message: '任务参数更新成功'
    });
  } catch (error) {
    addLog.error('[UpdateParamsAPI] 更新失败', error as Error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '更新失败，请稍后重试',
      details: { error: error instanceof Error ? error.message : String(error) }
    } as any);
  }
}

export default NextAPI(handler);
