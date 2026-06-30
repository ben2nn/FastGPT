/**
 * 按应用统计 API
 * GET /api/statistics/by-app
 *
 * 功能：查询指定时间范围内按应用分组的统计数据
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { statisticsService } from '@/service/core/statistics/statisticsService';
import { validateAndCleanQuery } from '@/service/core/statistics/validation';
import type { AppStatisticsResponse } from '@/service/core/statistics/statistics';
import { StatisticsError, StatisticsErrorCode } from '@/service/core/statistics/statistics';

/**
 * 查询参数类型
 */
export type AppStatisticsQueryParams = {
  startTime: string; // 开始时间（ISO 8601 格式）
  endTime: string; // 结束时间（ISO 8601 格式）
  modelName?: string; // 可选：模型名称筛选
  callStatus?: string; // 可选：调用状态筛选
  pageNum?: string; // 分页页码（字符串类型，需要转换）
  pageSize?: string; // 每页数量（字符串类型，需要转换）
};

/**
 * 按应用统计 API 处理函数
 */
async function handler(
  req: ApiRequestProps<{}, AppStatisticsQueryParams>,
  res: ApiResponseType<AppStatisticsResponse>
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

    // 3. 解析和验证查询参数
    addLog.debug('[AppStatisticsAPI] 原始查询参数', { query: req.query });

    let validatedQuery;
    try {
      validatedQuery = validateAndCleanQuery(req.query);
      addLog.debug('[AppStatisticsAPI] 验证后的查询参数', { validatedQuery });
    } catch (error) {
      if (error instanceof StatisticsError) {
        addLog.warn('[AppStatisticsAPI] 参数验证失败', {
          error: error.message,
          details: error.details
        });
        return res.status(400).json({
          code: error.code,
          message: error.message,
          details: error.details
        } as any);
      }
      return res.status(400).json({
        code: StatisticsErrorCode.INVALID_TIME_RANGE,
        message: '查询参数验证失败',
        details: { error: error instanceof Error ? error.message : String(error) }
      } as any);
    }

    // 5. 验证分页参数
    const pageNum = validatedQuery.pageNum || 1;
    const pageSize = validatedQuery.pageSize || 20;

    // 验证 pageSize 不超过最大值
    if (pageSize > 100) {
      addLog.warn('[AppStatisticsAPI] pageSize 超过最大值', { pageSize });
      return res.status(400).json({
        code: StatisticsErrorCode.INVALID_PAGINATION,
        message: 'pageSize 不能超过 100',
        details: { pageSize, maxPageSize: 100 }
      } as any);
    }

    // 验证 pageNum 为正整数
    if (pageNum < 1) {
      addLog.warn('[AppStatisticsAPI] pageNum 无效', { pageNum });
      return res.status(400).json({
        code: StatisticsErrorCode.INVALID_PAGINATION,
        message: 'pageNum 必须大于 0',
        details: { pageNum }
      } as any);
    }

    // 6. 初始化统计服务（如果尚未初始化）
    try {
      await statisticsService.initialize();
    } catch (error) {
      addLog.error('[AppStatisticsAPI] 统计服务初始化失败', error as Error);
      return res.status(500).json({
        code: StatisticsErrorCode.DATABASE_ERROR,
        message: '统计服务初始化失败，请稍后重试'
      } as any);
    }

    // 7. 调用统计服务获取数据
    let result: AppStatisticsResponse;
    try {
      result = await statisticsService.getAppStatistics(validatedQuery);
      addLog.info('[AppStatisticsAPI] 按应用统计查询成功', {
        filters: {
          startTime: validatedQuery.startTime,
          endTime: validatedQuery.endTime,
          modelName: validatedQuery.modelName,
          callStatus: validatedQuery.callStatus,
          pageNum,
          pageSize
        },
        result: {
          total: result.total,
          listCount: result.list.length
        },
        duration: `${Date.now() - startTime}ms`
      });
    } catch (error) {
      if (error instanceof StatisticsError) {
        addLog.error('[AppStatisticsAPI] 统计查询失败', {
          code: error.code,
          message: error.message,
          details: error.details
        });

        // 根据错误代码返回相应的 HTTP 状态码
        let statusCode = 500;
        switch (error.code) {
          case StatisticsErrorCode.QUERY_TIMEOUT:
            statusCode = 504;
            break;
          case StatisticsErrorCode.DATABASE_ERROR:
          default:
            statusCode = 500;
            break;
        }

        return res.status(statusCode).json({
          code: error.code,
          message: error.message,
          details: error.details
        } as any);
      }

      addLog.error('[AppStatisticsAPI] 统计查询失败（未知错误）', error as Error);
      return res.status(500).json({
        code: StatisticsErrorCode.DATABASE_ERROR,
        message: '统计查询失败，请稍后重试',
        details: { error: error instanceof Error ? error.message : String(error) }
      } as any);
    }

    // 8. 返回结果
    return res.status(200).json(result);
  } catch (error) {
    // 统一错误处理（捕获未预期的错误）
    addLog.error('[AppStatisticsAPI] 未知错误', error as Error);
    return res.status(500).json({
      code: StatisticsErrorCode.DATABASE_ERROR,
      message: '服务器内部错误，请稍后重试'
    } as any);
  }
}

export default NextAPI(handler);
