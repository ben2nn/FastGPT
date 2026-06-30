/**
 * 数据导出 API
 * GET /api/statistics/export
 *
 * 功能：导出统计数据为 CSV 或 JSON 格式
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';

import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import { statisticsService } from '@/service/core/statistics/statisticsService';
import { validateAndCleanQuery } from '@/service/core/statistics/validation';
import type {
  OverviewStatistics,
  AppStatisticsResponse,
  ModelStatisticsResponse,
  TrendStatisticsResponse,
  StatusStatisticsResponse
} from '@/service/core/statistics/statistics';
import { StatisticsError, StatisticsErrorCode } from '@/service/core/statistics/statistics';

/**
 * 导出格式类型
 */
type ExportFormat = 'csv' | 'json';

/**
 * 导出类型
 */
type ExportType = 'overview' | 'by-app' | 'by-model' | 'trend' | 'status';

/**
 * 查询参数类型
 */
export type ExportQueryParams = {
  startTime: string;
  endTime: string;
  format: ExportFormat;
  exportType: ExportType;
  appId?: string;
  modelName?: string;
  callStatus?: string;
};

/**
 * 将数据转换为 CSV 格式
 */
function convertToCSV(data: any[], type: ExportType): string {
  if (data.length === 0) {
    return '';
  }

  let headers: string[] = [];
  let rows: string[][] = [];

  switch (type) {
    case 'overview':
      headers = ['总调用次数', '总Token数', '总积分消耗', '成功率(%)', '平均每次调用Token数'];
      const overview = data[0] as OverviewStatistics;
      rows = [
        [
          overview.totalCalls.toString(),
          overview.totalTokens.toString(),
          overview.totalPoints.toFixed(2),
          overview.successRate.toFixed(2),
          overview.avgTokensPerCall.toFixed(2)
        ]
      ];
      break;

    case 'by-app':
      headers = ['应用ID', '应用名称', '调用次数', '总Token数', '总积分消耗', '最后调用时间'];
      rows = data.map((item: any) => [
        item.appId,
        item.appName,
        item.callCount.toString(),
        item.totalTokens.toString(),
        item.totalPoints.toFixed(2),
        item.lastCallTime
      ]);
      break;

    case 'by-model':
      headers = ['模型ID', '模型名称', '调用次数', '总Token数', '平均每次调用Token数'];
      rows = data.map((item: any) => [
        item.modelId,
        item.modelName,
        item.callCount.toString(),
        item.totalTokens.toString(),
        item.avgTokensPerCall.toFixed(2)
      ]);
      break;

    case 'trend':
      headers = ['时间', '调用次数', '总Token数', '总积分消耗'];
      rows = data.map((item: any) => [
        item.timestamp,
        item.callCount.toString(),
        item.totalTokens.toString(),
        item.totalPoints.toFixed(2)
      ]);
      break;

    case 'status':
      headers = ['状态', '数量', '占比(%)'];
      rows = data.map((item: any) => [
        item.status,
        item.count.toString(),
        item.percentage.toFixed(2)
      ]);
      break;
  }

  // 转义 CSV 字段（处理包含逗号、引号、换行符的情况）
  const escapeCSVField = (field: string): string => {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  // 构建 CSV 内容
  const csvLines: string[] = [];

  // 添加 BOM 以支持 Excel 正确显示中文
  csvLines.push('\uFEFF');

  // 添加表头
  csvLines.push(headers.map(escapeCSVField).join(','));

  // 添加数据行
  rows.forEach((row) => {
    csvLines.push(row.map(escapeCSVField).join(','));
  });

  return csvLines.join('\n');
}

/**
 * 数据导出 API 处理函数
 */
async function handler(req: ApiRequestProps<{}, ExportQueryParams>, res: ApiResponseType<any>) {
  const startTime = Date.now();

  try {
    // 1. 验证请求方法
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({
        code: 'METHOD_NOT_ALLOWED',
        message: '方法不允许，仅支持 GET 请求'
      });
    }

    // 2. 管理员认证
    await authAdmin(req);

    // 3. 解析和验证查询参数
    const { format, exportType, ...queryParams } = req.query;

    // 验证导出格式
    if (!format || !['csv', 'json'].includes(format)) {
      return res.status(400).json({
        code: StatisticsErrorCode.INVALID_PAGINATION,
        message: '无效的导出格式，仅支持 csv 或 json'
      });
    }

    // 验证导出类型
    if (
      !exportType ||
      !['overview', 'by-app', 'by-model', 'trend', 'status'].includes(exportType)
    ) {
      return res.status(400).json({
        code: StatisticsErrorCode.INVALID_PAGINATION,
        message: '无效的导出类型'
      });
    }

    addLog.debug('[ExportAPI] 导出参数', { format, exportType, queryParams });

    // 验证查询参数
    let validatedQuery;
    try {
      validatedQuery = validateAndCleanQuery(queryParams);
    } catch (error) {
      if (error instanceof StatisticsError) {
        addLog.warn('[ExportAPI] 参数验证失败', {
          error: error.message,
          details: error.details
        });
        return res.status(400).json({
          code: error.code,
          message: error.message,
          details: error.details
        });
      }
      return res.status(400).json({
        code: StatisticsErrorCode.INVALID_TIME_RANGE,
        message: '查询参数验证失败',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
    }

    // 5. 初始化统计服务
    try {
      await statisticsService.initialize();
    } catch (error) {
      addLog.error('[ExportAPI] 统计服务初始化失败', error as Error);
      return res.status(500).json({
        code: StatisticsErrorCode.DATABASE_ERROR,
        message: '统计服务初始化失败，请稍后重试'
      });
    }

    // 6. 根据导出类型获取数据
    let exportData: any;
    let fileName: string;

    try {
      // 设置导出超时时间为 10 秒
      const exportTimeout = 10000;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new StatisticsError(
              StatisticsErrorCode.QUERY_TIMEOUT,
              '导出超时，请缩小时间范围或添加更多筛选条件'
            )
          );
        }, exportTimeout);
      });

      // 根据导出类型调用相应的服务方法
      let dataPromise: Promise<any>;

      switch (exportType) {
        case 'overview':
          dataPromise = statisticsService.getOverviewStatistics(validatedQuery);
          fileName = `overview-statistics-${Date.now()}`;
          break;

        case 'by-app':
          // 导出时不分页，获取所有数据（但限制最大数量）
          dataPromise = statisticsService.getAppStatistics({
            ...validatedQuery,
            pageNum: 1,
            pageSize: 10000
          });
          fileName = `app-statistics-${Date.now()}`;
          break;

        case 'by-model':
          dataPromise = statisticsService.getModelStatistics({
            ...validatedQuery,
            pageNum: 1,
            pageSize: 10000
          });
          fileName = `model-statistics-${Date.now()}`;
          break;

        case 'trend':
          dataPromise = statisticsService.getTrendStatistics(validatedQuery);
          fileName = `trend-statistics-${Date.now()}`;
          break;

        case 'status':
          dataPromise = statisticsService.getStatusStatistics(validatedQuery);
          fileName = `status-statistics-${Date.now()}`;
          break;

        default:
          return res.status(400).json({
            code: StatisticsErrorCode.INVALID_PAGINATION,
            message: '不支持的导出类型'
          });
      }

      // 竞速执行（查询 vs 超时）
      const result = await Promise.race([dataPromise, timeoutPromise]);
      exportData = result;

      addLog.info('[ExportAPI] 数据查询成功', {
        exportType,
        format,
        duration: `${Date.now() - startTime}ms`
      });
    } catch (error) {
      if (error instanceof StatisticsError) {
        addLog.error('[ExportAPI] 数据查询失败', {
          code: error.code,
          message: error.message
        });

        let statusCode = 500;
        if (error.code === StatisticsErrorCode.QUERY_TIMEOUT) {
          statusCode = 504;
        }

        return res.status(statusCode).json({
          code: error.code,
          message: error.message,
          details: error.details
        });
      }

      addLog.error('[ExportAPI] 数据查询失败（未知错误）', error as Error);
      return res.status(500).json({
        code: StatisticsErrorCode.DATABASE_ERROR,
        message: '数据查询失败，请稍后重试'
      });
    }

    // 7. 转换数据格式并返回
    try {
      if (format === 'csv') {
        // CSV 格式导出
        let csvData: string;

        if (exportType === 'overview') {
          csvData = convertToCSV([exportData], exportType);
        } else if (exportType === 'by-app' || exportType === 'by-model') {
          // 检查数据量
          const dataList = (exportData as any).list || [];
          if (dataList.length > 10000) {
            return res.status(400).json({
              code: 'EXPORT_FAILED',
              message: '导出数据量过大（超过 10000 条），请缩小时间范围'
            });
          }
          csvData = convertToCSV(dataList, exportType);
        } else if (exportType === 'trend') {
          const trendData = (exportData as TrendStatisticsResponse).items || [];
          if (trendData.length > 10000) {
            return res.status(400).json({
              code: 'EXPORT_FAILED',
              message: '导出数据量过大（超过 10000 条），请缩小时间范围'
            });
          }
          csvData = convertToCSV(trendData, exportType);
        } else if (exportType === 'status') {
          const statusData = (exportData as StatusStatisticsResponse).distribution || [];
          csvData = convertToCSV(statusData, exportType);
        } else {
          csvData = '';
        }

        // 设置响应头
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);

        addLog.info('[ExportAPI] CSV 导出成功', {
          exportType,
          fileName: `${fileName}.csv`,
          size: csvData.length
        });

        return res.status(200).send(csvData);
      } else {
        // JSON 格式导出
        let jsonData: any;

        if (exportType === 'overview') {
          jsonData = exportData;
        } else if (exportType === 'by-app' || exportType === 'by-model') {
          const dataList = (exportData as any).list || [];
          if (dataList.length > 10000) {
            return res.status(400).json({
              code: 'EXPORT_FAILED',
              message: '导出数据量过大（超过 10000 条），请缩小时间范围'
            });
          }
          jsonData = {
            exportType,
            exportTime: new Date().toISOString(),
            filters: {
              startTime: validatedQuery.startTime,
              endTime: validatedQuery.endTime,
              appId: validatedQuery.appId,
              modelName: validatedQuery.modelName,
              callStatus: validatedQuery.callStatus
            },
            data: dataList,
            total: (exportData as any).total
          };
        } else if (exportType === 'trend') {
          const trendData = (exportData as TrendStatisticsResponse).items || [];
          if (trendData.length > 10000) {
            return res.status(400).json({
              code: 'EXPORT_FAILED',
              message: '导出数据量过大（超过 10000 条），请缩小时间范围'
            });
          }
          jsonData = {
            exportType,
            exportTime: new Date().toISOString(),
            filters: {
              startTime: validatedQuery.startTime,
              endTime: validatedQuery.endTime,
              appId: validatedQuery.appId,
              modelName: validatedQuery.modelName,
              callStatus: validatedQuery.callStatus
            },
            granularity: (exportData as TrendStatisticsResponse).granularity,
            data: trendData
          };
        } else if (exportType === 'status') {
          jsonData = {
            exportType,
            exportTime: new Date().toISOString(),
            filters: {
              startTime: validatedQuery.startTime,
              endTime: validatedQuery.endTime,
              appId: validatedQuery.appId,
              modelName: validatedQuery.modelName
            },
            ...exportData
          };
        }

        // 设置响应头
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}.json"`);

        const jsonString = JSON.stringify(jsonData, null, 2);

        addLog.info('[ExportAPI] JSON 导出成功', {
          exportType,
          fileName: `${fileName}.json`,
          size: jsonString.length
        });

        return res.status(200).send(jsonString);
      }
    } catch (error) {
      addLog.error('[ExportAPI] 数据格式转换失败', error as Error);
      return res.status(500).json({
        code: 'EXPORT_FAILED',
        message: '数据导出失败，请稍后重试',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  } catch (error) {
    // 统一错误处理（捕获未预期的错误）
    addLog.error('[ExportAPI] 未知错误', error as Error);
    return res.status(500).json({
      code: StatisticsErrorCode.DATABASE_ERROR,
      message: '服务器内部错误，请稍后重试'
    });
  }
}

export default NextAPI(handler);
