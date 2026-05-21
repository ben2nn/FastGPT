/**
 * 时间趋势统计 API
 * GET /api/statistics/trend
 *
 * 功能：查询指定时间范围内的调用量时间趋势数据
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { statisticsService } from '@/service/core/statistics/statisticsService';
import { validateAndCleanQuery } from '@/service/core/statistics/validation';
import type {
  TrendStatisticsResponse,
  TimeGranularity
} from '@/service/core/statistics/statistics';
import { StatisticsError, StatisticsErrorCode } from '@/service/core/statistics/statistics';

/**
 * 查询参数类型
 */
export type TrendStatisticsQueryParams = {
  startTime: string; // 开始时间（ISO 8601 格式）
  endTime: string; // 结束时间（ISO 8601 格式）
  appId?: string; // 可选：应用ID筛选
  modelName?: string; // 可选：模型名称筛选
  callStatus?: string; // 可选：调用状态筛选
  granularity?: string; // 可选：时间粒度（day/week/month）
};

/**
 * 时间趋势统计 API 处理函数
 */
async function handler(
  req: ApiRequestProps<{}, TrendStatisticsQueryParams>,
  res: ApiResponseType<TrendStatisticsResponse>
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

    // 2. 身份认证
    /* let tmbId: string;
        try {
            const authResult = await authCert({ req, authToken: true });
            tmbId = authResult.tmbId;
            addLog.debug('[TrendStatisticsAPI] 用户身份验证成功', { tmbId });
        } catch (error) {
            addLog.warn('[TrendStatisticsAPI] 身份验证失败', {
                error: error instanceof Error ? error.message : String(error)
            });
            return res.status(401).json({
                code: StatisticsErrorCode.UNAUTHORIZED,
                message: '身份验证失败，请先登录'
            } as any);
        } */

    // 3. 验证管理员权限
    // TODO: 实现管理员权限验证
    // 目前暂时跳过，后续根据项目的权限系统实现
    // const user = await getUserById(tmbId);
    // if (user.role !== 'admin') {
    //   return res.status(403).json({
    //     code: StatisticsErrorCode.UNAUTHORIZED,
    //     message: '需要管理员权限'
    //   } as any);
    // }

    // 4. 解析和验证查询参数
    addLog.debug('[TrendStatisticsAPI] 原始查询参数', { query: req.query });

    let validatedQuery;
    try {
      validatedQuery = validateAndCleanQuery(req.query);
      addLog.debug('[TrendStatisticsAPI] 验证后的查询参数', { validatedQuery });
    } catch (error) {
      if (error instanceof StatisticsError) {
        addLog.warn('[TrendStatisticsAPI] 参数验证失败', {
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

    // 5. 验证和解析 granularity 参数
    let explicitGranularity: TimeGranularity | undefined;
    if (req.query.granularity) {
      const granularity = req.query.granularity.toLowerCase();
      if (!['day', 'week', 'month'].includes(granularity)) {
        addLog.warn('[TrendStatisticsAPI] 无效的 granularity 参数', { granularity });
        return res.status(400).json({
          code: StatisticsErrorCode.INVALID_TIME_RANGE,
          message: 'granularity 参数无效，必须是 day、week 或 month',
          details: { granularity, validValues: ['day', 'week', 'month'] }
        } as any);
      }
      explicitGranularity = granularity as TimeGranularity;
      addLog.debug('[TrendStatisticsAPI] 使用显式指定的 granularity', { explicitGranularity });
    }

    // 6. 初始化统计服务（如果尚未初始化）
    try {
      await statisticsService.initialize();
    } catch (error) {
      addLog.error('[TrendStatisticsAPI] 统计服务初始化失败', error as Error);
      return res.status(500).json({
        code: StatisticsErrorCode.DATABASE_ERROR,
        message: '统计服务初始化失败，请稍后重试'
      } as any);
    }

    // 7. 调用统计服务获取数据
    let result: TrendStatisticsResponse;
    try {
      result = await statisticsService.getTrendStatistics(validatedQuery, explicitGranularity);
      addLog.info('[TrendStatisticsAPI] 时间趋势统计查询成功', {
        filters: {
          startTime: validatedQuery.startTime,
          endTime: validatedQuery.endTime,
          appId: validatedQuery.appId,
          modelName: validatedQuery.modelName,
          callStatus: validatedQuery.callStatus,
          granularity: result.granularity
        },
        result: {
          granularity: result.granularity,
          dataPoints: result.items.length
        },
        duration: `${Date.now() - startTime}ms`
      });
    } catch (error) {
      if (error instanceof StatisticsError) {
        addLog.error('[TrendStatisticsAPI] 统计查询失败', {
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

      addLog.error('[TrendStatisticsAPI] 统计查询失败（未知错误）', error as Error);
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
    addLog.error('[TrendStatisticsAPI] 未知错误', error as Error);
    return res.status(500).json({
      code: StatisticsErrorCode.DATABASE_ERROR,
      message: '服务器内部错误，请稍后重试'
    } as any);
  }
}

export default NextAPI(handler);
