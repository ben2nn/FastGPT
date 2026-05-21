/**
 * 统计服务
 * 负责执行统计查询并处理结果
 */

import type { Pool, QueryResult, QueryResultRow } from 'pg';
import { PoolClient } from 'pg';
import { addLog } from '@fastgpt/service/common/system/log';
import { getPostgresPool } from '@/service/common/postgres';
import type { SqlQuery } from './queryBuilder';
import { QueryBuilder } from './queryBuilder';
import { calculateGranularity } from './validation';
import type {
  StatisticsQuery,
  OverviewStatistics,
  AppStatisticsResponse,
  ModelStatisticsResponse,
  TrendStatisticsResponse,
  StatusStatisticsResponse,
  StatisticsListResponse,
  TimeGranularity
} from '@/service/core/statistics/statistics';
import { StatisticsError, StatisticsErrorCode } from '@/service/core/statistics/statistics';

/**
 * 统计服务类
 * 提供统计数据查询和处理功能
 */
export class StatisticsService {
  private pool: Pool | null = null;
  private queryBuilder: QueryBuilder;
  private isInitialized: boolean = false;

  constructor() {
    this.queryBuilder = new QueryBuilder();
  }

  /**
   * 初始化数据库连接池
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 使用全局连接池
      this.pool = getPostgresPool();

      // 测试连接
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      this.isInitialized = true;
      addLog.info('统计服务初始化成功');
    } catch (error) {
      addLog.error('统计服务初始化失败', error as Error);
      throw new StatisticsError(StatisticsErrorCode.DATABASE_ERROR, '统计服务初始化失败', error);
    }
  }

  /**
   * 获取数据库连接池
   */
  private getPool(): Pool {
    if (!this.isInitialized || !this.pool) {
      throw new StatisticsError(StatisticsErrorCode.DATABASE_ERROR, '统计服务未初始化');
    }
    return this.pool;
  }

  /**
   * 执行查询（带超时控制）
   * @param query SQL 查询对象
   * @param timeoutMs 超时时间（毫秒），默认 5000ms
   */
  private async executeQuery<T extends QueryResultRow = any>(
    query: SqlQuery,
    timeoutMs: number = 5000
  ): Promise<QueryResult<T>> {
    const pool = this.getPool();

    try {
      // 创建超时 Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new StatisticsError(
              StatisticsErrorCode.QUERY_TIMEOUT,
              `查询超时（${timeoutMs}ms），请缩小时间范围或添加更多筛选条件`
            )
          );
        }, timeoutMs);
      });

      // 执行查询
      const queryPromise = pool.query<T>(query.text, query.values);

      // 竞速执行
      const result = await Promise.race([queryPromise, timeoutPromise]);

      return result;
    } catch (error) {
      // 如果是 StatisticsError，直接抛出
      if (error instanceof StatisticsError) {
        throw error;
      }

      // 记录错误日志
      addLog.error('查询执行失败', error as Error);

      // 包装为 StatisticsError
      throw new StatisticsError(StatisticsErrorCode.DATABASE_ERROR, '数据库查询失败', error);
    }
  }

  /**
   * 获取总览统计
   */
  async getOverviewStatistics(filters: StatisticsQuery): Promise<OverviewStatistics> {
    try {
      addLog.info('执行总览统计查询', { filters });

      // 构建查询
      const query = this.queryBuilder.buildOverviewQuery(filters);

      // 执行查询
      const result = await this.executeQuery<{
        total_calls: string;
        total_tokens: string;
        total_points: string;
        success_rate: string;
        avg_tokens_per_call: string;
      }>(query);

      // 处理结果
      if (result.rows.length === 0) {
        return {
          totalCalls: 0,
          totalTokens: 0,
          totalPoints: 0,
          successRate: 0,
          avgTokensPerCall: 0,
          timeRange: {
            start: filters.startTime,
            end: filters.endTime
          }
        };
      }

      const row = result.rows[0];

      return {
        totalCalls: parseInt(row.total_calls, 10),
        totalTokens: parseInt(row.total_tokens, 10),
        totalPoints: parseFloat(row.total_points),
        successRate: parseFloat(row.success_rate),
        avgTokensPerCall: parseFloat(row.avg_tokens_per_call),
        timeRange: {
          start: filters.startTime,
          end: filters.endTime
        }
      };
    } catch (error) {
      addLog.error('总览统计查询失败', error as Error);
      throw error;
    }
  }

  /**
   * 获取按应用统计
   */
  async getAppStatistics(filters: StatisticsQuery): Promise<AppStatisticsResponse> {
    try {
      addLog.info('执行按应用统计查询', { filters });

      // 并行执行列表查询和总数查询
      const [listResult, countResult] = await Promise.all([
        this.executeQuery<{
          app_id: string;
          app_name: string;
          call_count: string;
          total_tokens: string;
          total_points: string;
          last_call_time: Date;
        }>(this.queryBuilder.buildAppStatisticsQuery(filters)),
        this.executeQuery<{ total: string }>(this.queryBuilder.buildAppCountQuery(filters))
      ]);

      // 处理结果
      const list = listResult.rows.map((row) => ({
        appId: row.app_id,
        appName: row.app_name || '',
        callCount: parseInt(row.call_count, 10),
        totalTokens: parseInt(row.total_tokens, 10),
        totalPoints: parseFloat(row.total_points),
        lastCallTime: row.last_call_time.toISOString()
      }));

      const total = countResult.rows.length > 0 ? parseInt(countResult.rows[0].total, 10) : 0;

      return {
        total,
        list,
        pageNum: filters.pageNum || 1,
        pageSize: filters.pageSize || 20
      };
    } catch (error) {
      addLog.error('按应用统计查询失败', error as Error);
      throw error;
    }
  }

  /**
   * 获取按模型统计
   */
  async getModelStatistics(filters: StatisticsQuery): Promise<ModelStatisticsResponse> {
    try {
      addLog.info('执行按模型统计查询', { filters });

      // 并行执行列表查询和总数查询
      const [listResult, countResult] = await Promise.all([
        this.executeQuery<{
          model_id: string;
          model_name: string;
          call_count: string;
          total_tokens: string;
          avg_tokens_per_call: string;
        }>(this.queryBuilder.buildModelStatisticsQuery(filters)),
        this.executeQuery<{ total: string }>(this.queryBuilder.buildModelCountQuery(filters))
      ]);

      // 处理结果
      const list = listResult.rows.map((row) => ({
        modelId: row.model_id,
        modelName: row.model_name,
        callCount: parseInt(row.call_count, 10),
        totalTokens: parseInt(row.total_tokens, 10),
        avgTokensPerCall: parseFloat(row.avg_tokens_per_call)
      }));

      const total = countResult.rows.length > 0 ? parseInt(countResult.rows[0].total, 10) : 0;

      return {
        total,
        list,
        pageNum: filters.pageNum || 1,
        pageSize: filters.pageSize || 20
      };
    } catch (error) {
      addLog.error('按模型统计查询失败', error as Error);
      throw error;
    }
  }

  /**
   * 获取时间趋势统计
   */
  async getTrendStatistics(
    filters: StatisticsQuery,
    explicitGranularity?: TimeGranularity
  ): Promise<TrendStatisticsResponse> {
    try {
      addLog.info('执行时间趋势统计查询', { filters, explicitGranularity });

      // 计算时间粒度
      const granularity = calculateGranularity(
        filters.startTime,
        filters.endTime,
        explicitGranularity
      );

      // 构建查询
      const query = this.queryBuilder.buildTrendQuery(filters, granularity);

      // 执行查询
      const result = await this.executeQuery<{
        timestamp: Date;
        call_count: string;
        total_tokens: string;
        total_points: string;
      }>(query);

      // 处理结果
      const data = result.rows.map((row) => ({
        timestamp: row.timestamp.toISOString(),
        callCount: parseInt(row.call_count, 10),
        totalTokens: parseInt(row.total_tokens, 10),
        totalPoints: parseFloat(row.total_points)
      }));

      return {
        granularity,
        items: data // 改为 items 字段
      };
    } catch (error) {
      addLog.error('时间趋势统计查询失败', error as Error);
      throw error;
    }
  }

  /**
   * 获取状态统计
   */
  async getStatusStatistics(filters: StatisticsQuery): Promise<StatusStatisticsResponse> {
    try {
      addLog.info('执行状态统计查询', { filters });

      // 构建查询
      const query = this.queryBuilder.buildStatusQuery(filters);

      // 执行查询
      const result = await this.executeQuery<{
        status: string;
        count: string;
        percentage: string;
      }>(query);

      // 处理结果
      const distribution = result.rows.map((row) => ({
        status: row.status || 'unknown',
        count: parseInt(row.count, 10),
        percentage: parseFloat(row.percentage)
      }));

      // 计算总数和成功率
      const total = distribution.reduce((sum, item) => sum + item.count, 0);
      const successItem = distribution.find((item) => item.status === 'success');
      const successRate = successItem ? successItem.percentage : 0;

      // 计算失败率
      const failedItem = distribution.find((item) => item.status === 'failed');
      const failedRate = failedItem ? failedItem.percentage : 0;

      // 判断是否需要警告（失败率超过 5%）
      const hasWarning = failedRate > 5;

      return {
        total,
        successRate,
        hasWarning,
        distribution
      };
    } catch (error) {
      addLog.error('状态统计查询失败', error as Error);
      throw error;
    }
  }

  /**
   * 获取统计列表
   */
  async getStatisticsList(filters: StatisticsQuery): Promise<StatisticsListResponse> {
    try {
      addLog.info('执行统计列表查询', { filters });

      // 构建查询
      const listQuery = this.queryBuilder.buildStatisticsListQuery(filters);
      const countQuery = this.queryBuilder.buildStatisticsListCountQuery(filters);

      // 记录 SQL 查询和参数（用于调试）
      addLog.debug('统计列表查询 SQL', {
        listQuery: {
          text: listQuery.text,
          values: listQuery.values
        },
        countQuery: {
          text: countQuery.text,
          values: countQuery.values
        }
      });

      // 先检查数据库中是否有数据（调试用）
      try {
        const totalCountResult = await this.executeQuery<{ count: string }>({
          text: 'SELECT COUNT(*) as count FROM model_call_logs',
          values: []
        });
        const totalCount = parseInt(totalCountResult.rows[0].count, 10);
        addLog.debug('数据库总记录数', { totalCount });

        if (totalCount > 0) {
          // 检查时间范围内的记录数
          const rangeCountResult = await this.executeQuery<{ count: string }>({
            text: 'SELECT COUNT(*) as count FROM model_call_logs WHERE call_timestamp >= $1 AND call_timestamp <= $2',
            values: [filters.startTime, filters.endTime]
          });
          const rangeCount = parseInt(rangeCountResult.rows[0].count, 10);
          addLog.debug('时间范围内的记录数', {
            startTime: filters.startTime,
            endTime: filters.endTime,
            rangeCount
          });

          // 检查数据的时间范围
          const timeRangeResult = await this.executeQuery<{
            min_time: Date;
            max_time: Date;
          }>({
            text: 'SELECT MIN(call_timestamp) as min_time, MAX(call_timestamp) as max_time FROM model_call_logs',
            values: []
          });
          addLog.debug('数据库中的时间范围', {
            minTime: timeRangeResult.rows[0].min_time,
            maxTime: timeRangeResult.rows[0].max_time
          });
        }
      } catch (debugError) {
        addLog.warn('调试查询失败', debugError as Error);
      }

      // 并行执行列表查询和总数查询
      const [listResult, countResult] = await Promise.all([
        this.executeQuery<{
          app_id: string;
          app_name: string;
          model_name: string;
          usage_scenario: string;
          call_count: string;
          total_tokens: string;
          total_points: string;
          success_rate: string;
          avg_tokens_per_call: string;
        }>(listQuery),
        this.executeQuery<{ total: string }>(countQuery)
      ]);

      // 处理结果
      const list = listResult.rows.map((row) => ({
        appId: row.app_id,
        appName: row.app_name || '',
        modelName: row.model_name,
        usageScenario: row.usage_scenario,
        callCount: parseInt(row.call_count, 10),
        totalTokens: parseInt(row.total_tokens, 10),
        totalPoints: parseFloat(row.total_points),
        successRate: parseFloat(row.success_rate),
        avgTokensPerCall: parseFloat(row.avg_tokens_per_call)
      }));

      const total = countResult.rows.length > 0 ? parseInt(countResult.rows[0].total, 10) : 0;

      return {
        total,
        list,
        pageNum: filters.pageNum || 1,
        pageSize: filters.pageSize || 20
      };
    } catch (error) {
      addLog.error('统计列表查询失败', error as Error);
      throw error;
    }
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.pool) {
      addLog.info('关闭统计服务连接池...');
      await this.pool.end();
      this.pool = null;
      this.isInitialized = false;
      addLog.info('统计服务连接池已关闭');
    }
  }
}

// 导出单例实例
export const statisticsService = new StatisticsService();
