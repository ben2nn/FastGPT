/**
 * 执行详情 API
 * GET /api/admin/tasks/executions/:executionId
 *
 * 功能：获取单个执行记录的详细信息
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { getTaskManager } from '@/service/core/task/instance';

/**
 * 查询参数类型
 */
export type ExecutionDetailQueryParams = {
  executionId: string;
};

/**
 * 执行详情响应类型
 */
export type ExecutionDetailResponse = {
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
  createdAt?: string;
};

/**
 * 执行详情 API 处理函数
 */
async function handler(
  req: ApiRequestProps<{}, ExecutionDetailQueryParams>,
  res: ApiResponseType<ExecutionDetailResponse>
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
    const { executionId } = req.query;

    if (!executionId) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: '缺少必要参数: executionId'
      } as any);
    }

    // 验证 executionId 是否为有效的数字
    const executionIdNum = parseInt(executionId, 10);
    if (isNaN(executionIdNum) || executionIdNum < 1) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: 'executionId 必须是大于 0 的整数'
      } as any);
    }

    // 4. 获取 TaskManager 实例
    let taskManager;
    try {
      taskManager = await getTaskManager();
    } catch (error) {
      addLog.error('[ExecutionDetailAPI] 获取 TaskManager 实例失败', error as Error);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: '任务管理器初始化失败，请稍后重试'
      } as any);
    }

    // 5. 获取执行记录详情
    try {
      const execution = await taskManager.getExecutionById(executionIdNum);

      if (!execution) {
        addLog.warn('[ExecutionDetailAPI] 执行记录不存在', { executionId: executionIdNum });
        return res.status(404).json({
          code: 'EXECUTION_NOT_FOUND',
          message: `执行记录不存在: ${executionId}`
        } as any);
      }

      // 构建响应
      const result: ExecutionDetailResponse = {
        id: execution.id,
        taskId: execution.taskId,
        taskName: execution.taskName,
        startTime: execution.startTime.toISOString(),
        endTime: execution.endTime?.toISOString(),
        status: execution.status,
        params: execution.params,
        result: execution.result,
        errorMessage: execution.errorMessage,
        executionTimeMs: execution.executionTimeMs,
        createdAt: execution.createdAt?.toISOString()
      };

      addLog.info('[ExecutionDetailAPI] 执行详情查询成功', {
        executionId: executionIdNum,
        taskId: execution.taskId,
        duration: `${Date.now() - startTime}ms`
      });

      return res.status(200).json(result);
    } catch (error) {
      addLog.error('[ExecutionDetailAPI] 查询执行详情失败', error as Error);
      return res.status(500).json({
        code: 'DATABASE_ERROR',
        message: '查询执行详情失败，请稍后重试',
        details: { error: error instanceof Error ? error.message : String(error) }
      } as any);
    }
  } catch (error) {
    addLog.error('[ExecutionDetailAPI] 未知错误', error as Error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误，请稍后重试',
      details: { error: error instanceof Error ? error.message : String(error) }
    } as any);
  }
}

export default NextAPI(handler);
