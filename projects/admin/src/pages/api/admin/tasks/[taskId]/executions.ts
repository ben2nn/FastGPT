/**
 * 执行历史查询 API
 * GET /api/admin/tasks/:taskId/executions
 *
 * 功能：查询指定任务的执行历史，支持分页和筛选
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { getTaskManager } from '@/service/core/task/instance';
import type { TaskExecution, TaskExecutionStatus } from '@/types/task';

/**
 * 查询参数类型
 */
export type TaskExecutionsQueryParams = {
  taskId: string;
  page?: string;
  pageSize?: string;
  status?: TaskExecutionStatus;
  startTime?: string;
  endTime?: string;
};

/**
 * 执行历史项类型
 */
export type ExecutionHistoryItem = {
  id: number;
  taskId: string;
  taskName: string;
  startTime: string;
  endTime?: string;
  status: string;
  params?: Record<string, any>;
  result?: any;
  errorMessage?: string;
  executionTimeMs?: number;
};

/**
 * 响应类型
 */
export type TaskExecutionsResponse = {
  total: number;
  page: number;
  pageSize: number;
  executions: ExecutionHistoryItem[];
};

/**
 * 执行历史查询 API 处理函数
 */
async function handler(
  req: ApiRequestProps<{}, TaskExecutionsQueryParams>,
  res: ApiResponseType<TaskExecutionsResponse>
) {
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

    // 2. 管理员认证
    await authAdmin(req);

    // 3. 解析参数
    const {
      taskId,
      page,
      pageSize,
      status,
      startTime: startTimeStr,
      endTime: endTimeStr
    } = req.query;

    if (!taskId) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: '缺少必要参数: taskId'
      } as any);
    }

    // 解析分页参数
    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSizeNum = pageSize ? parseInt(pageSize, 10) : 20;

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: 'page 必须是大于 0 的整数'
      } as any);
    }

    if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 100) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: 'pageSize 必须是 1-100 之间的整数'
      } as any);
    }

    // 解析时间参数
    let startTimeDate: Date | undefined;
    let endTimeDate: Date | undefined;

    if (startTimeStr) {
      startTimeDate = new Date(startTimeStr);
      if (isNaN(startTimeDate.getTime())) {
        return res.status(400).json({
          code: 'INVALID_PARAMS',
          message: 'startTime 格式无效'
        } as any);
      }
    }

    if (endTimeStr) {
      endTimeDate = new Date(endTimeStr);
      if (isNaN(endTimeDate.getTime())) {
        return res.status(400).json({
          code: 'INVALID_PARAMS',
          message: 'endTime 格式无效'
        } as any);
      }
    }

    // 验证状态参数
    if (status && !['running', 'success', 'failed'].includes(status)) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: 'status 必须是 running、success 或 failed'
      } as any);
    }

    // 4. 获取 TaskManager 实例
    let taskManager;
    try {
      taskManager = await getTaskManager();
    } catch (error) {
      addLog.error('[TaskExecutionsAPI] 获取 TaskManager 实例失败', error as Error);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: '任务管理器初始化失败，请稍后重试'
      } as any);
    }

    // 5. 检查任务是否存在
    const config = taskManager.getTaskConfig(taskId);
    if (!config) {
      addLog.warn('[TaskExecutionsAPI] 任务不存在', { taskId });
      return res.status(404).json({
        code: 'TASK_NOT_FOUND',
        message: `任务不存在: ${taskId}`
      } as any);
    }

    // 6. 查询执行历史
    try {
      const { total, executions } = await taskManager.getExecutionHistory(taskId, {
        page: pageNum,
        pageSize: pageSizeNum,
        status,
        startTime: startTimeDate,
        endTime: endTimeDate
      });

      // 转换执行记录格式
      const executionItems: ExecutionHistoryItem[] = executions.map((execution) => ({
        id: execution.id,
        taskId: execution.taskId,
        taskName: execution.taskName,
        startTime: execution.startTime.toISOString(),
        endTime: execution.endTime?.toISOString(),
        status: execution.status,
        params: execution.params,
        result: execution.result,
        errorMessage: execution.errorMessage,
        executionTimeMs: execution.executionTimeMs
      }));

      const result: TaskExecutionsResponse = {
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        executions: executionItems
      };

      addLog.info('[TaskExecutionsAPI] 执行历史查询成功', {
        taskId,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        duration: `${Date.now() - startTime}ms`
      });

      return res.status(200).json(result);
    } catch (error) {
      addLog.error('[TaskExecutionsAPI] 查询执行历史失败', error as Error);
      return res.status(500).json({
        code: 'DATABASE_ERROR',
        message: '查询执行历史失败，请稍后重试',
        details: { error: error instanceof Error ? error.message : String(error) }
      } as any);
    }
  } catch (error) {
    addLog.error('[TaskExecutionsAPI] 未知错误', error as Error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误，请稍后重试',
      details: { error: error instanceof Error ? error.message : String(error) }
    } as any);
  }
}

export default NextAPI(handler);
