/**
 * 对外统计列表 API
 * GET /api/external/statistics/list
 *
 * 功能：三方通过 API Key 授权拉取按「应用 + 模型」分组的统计列表数据
 * 认证：Authorization: Bearer <key>（仅接受 API Key，不接受内部 session）
 * 权限约束：只读（仅 GET）；错误响应不泄露内部实现细节
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { authExternalApiKey, ApiKeyAuthError } from '@/service/support/permission/authApiKey';
import { statisticsService } from '@/service/core/statistics/statisticsService';
import { validateAndCleanQuery } from '@/service/core/statistics/validation';
import type { StatisticsListResponse } from '@/service/core/statistics/statistics';
import { StatisticsError, StatisticsErrorCode } from '@/service/core/statistics/statistics';

/**
 * 查询参数类型
 */
export type ExternalStatisticsListQueryParams = {
  startTime: string;
  endTime: string;
  appId?: string | string[]; // 支持多值：逗号分隔或重复参数，校验层归一化为数组
  appName?: string;
  modelId?: string | string[]; // 支持多值：逗号分隔或重复参数，校验层归一化为数组
  modelCategory?: string | string[]; // 可选：模型类别筛选（chat/embedding/rerank，支持多值：逗号分隔或重复参数）
  modelName?: string;
  callStatus?: string;
  pageNum?: string;
  pageSize?: string;
};

/**
 * 统一错误输出（结构与内部统计 API 一致，不泄露内部细节）
 */
function respondError(
  res: ApiResponseType<any>,
  statusCode: number,
  code: string,
  message: string,
  details?: any
) {
  return res.status(statusCode).json({
    code,
    message,
    ...(details !== undefined ? { details } : {})
  } as any);
}

/**
 * 对外统计列表 API 处理函数
 */
async function handler(
  req: ApiRequestProps<{}, ExternalStatisticsListQueryParams>,
  res: ApiResponseType<StatisticsListResponse>
) {
  const startTime = Date.now();

  try {
    // 1. 验证请求方法（对外仅开放只读 GET）
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return respondError(res, 405, 'METHOD_NOT_ALLOWED', '方法不允许，仅支持 GET 请求');
    }

    // 2. API Key 认证（无效/禁用/缺失统一 401，不区分存在性）
    let keyRecord;
    try {
      keyRecord = await authExternalApiKey(req);
    } catch (error) {
      if (error instanceof ApiKeyAuthError) {
        addLog.warn('[ExternalStatsListAPI] 认证失败', {
          url: req.url,
          error: error.message
        });
        return respondError(res, error.statusCode, error.code, error.message);
      }
      throw error;
    }

    // 3. 解析和验证查询参数（与内部统计 API 共用校验逻辑）
    let validatedQuery;
    try {
      validatedQuery = validateAndCleanQuery(req.query);
    } catch (error) {
      if (error instanceof StatisticsError) {
        addLog.warn('[ExternalStatsListAPI] 参数验证失败', {
          error: error.message,
          details: error.details
        });
        return respondError(res, 400, error.code, error.message, error.details);
      }
      return respondError(res, 400, StatisticsErrorCode.INVALID_TIME_RANGE, '查询参数验证失败', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // 3.1 分页参数兜底检查（与内部统计 API 一致）
    const pageNum = validatedQuery.pageNum || 1;
    const pageSize = validatedQuery.pageSize || 20;

    if (pageSize > 100) {
      addLog.warn('[ExternalStatsListAPI] pageSize 超过最大值', { pageSize });
      return respondError(
        res,
        400,
        StatisticsErrorCode.INVALID_PAGINATION,
        'pageSize 不能超过 100',
        {
          pageSize,
          maxPageSize: 100
        }
      );
    }

    if (pageNum < 1) {
      addLog.warn('[ExternalStatsListAPI] pageNum 无效', { pageNum });
      return respondError(res, 400, StatisticsErrorCode.INVALID_PAGINATION, 'pageNum 必须大于 0', {
        pageNum
      });
    }

    // 4. 初始化统计服务
    try {
      await statisticsService.initialize();
    } catch (error) {
      addLog.error('[ExternalStatsListAPI] 统计服务初始化失败', error as Error);
      return respondError(
        res,
        500,
        StatisticsErrorCode.DATABASE_ERROR,
        '统计服务初始化失败，请稍后重试'
      );
    }

    // 5. 执行统计查询
    let result: StatisticsListResponse;
    try {
      result = await statisticsService.getStatisticsList(validatedQuery);
    } catch (error) {
      if (error instanceof StatisticsError) {
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

        addLog.error('[ExternalStatsListAPI] 统计查询失败', {
          code: error.code,
          details: error.details
        });

        // 对外不回传内部错误细节，仅返回统一错误码与提示
        return respondError(
          res,
          statusCode,
          error.code,
          error.code === StatisticsErrorCode.QUERY_TIMEOUT
            ? '查询超时，请缩小时间范围或添加更多筛选条件'
            : '统计查询失败，请稍后重试'
        );
      }

      addLog.error('[ExternalStatsListAPI] 统计查询失败（未知错误）', error as Error);
      return respondError(res, 500, StatisticsErrorCode.DATABASE_ERROR, '统计查询失败，请稍后重试');
    }

    addLog.info('[ExternalStatsListAPI] 对外统计查询成功', {
      keyPrefix: keyRecord.keyPrefix,
      keyId: keyRecord.id,
      filters: {
        startTime: validatedQuery.startTime,
        endTime: validatedQuery.endTime,
        appId: validatedQuery.appId,
        appName: validatedQuery.appName,
        modelId: validatedQuery.modelId,
        modelName: validatedQuery.modelName,
        pageNum: validatedQuery.pageNum,
        pageSize: validatedQuery.pageSize
      },
      total: result.total,
      listCount: result.list.length,
      duration: `${Date.now() - startTime}ms`
    });

    // 6. 返回结果
    return res.status(200).json(result);
  } catch (error) {
    addLog.error('[ExternalStatsListAPI] 未知错误', error as Error);
    return respondError(res, 500, StatisticsErrorCode.DATABASE_ERROR, '服务器内部错误，请稍后重试');
  }
}

export default NextAPI(handler);
