/**
 * SQL 查询构建器
 * 负责构建统计查询的 SQL 语句和参数
 * 使用参数化查询防止 SQL 注入
 */

import type { StatisticsQuery, TimeGranularity } from '@/service/core/statistics/statistics';

/**
 * SQL 查询结果接口
 */
export interface SqlQuery {
  text: string;
  values: any[];
}

/**
 * 查询构建器类
 * 提供动态 WHERE 条件构建和参数绑定功能
 */
export class QueryBuilder {
  /**
   * 构建 WHERE 子句
   * 根据筛选条件动态生成 WHERE 子句和参数数组
   */
  buildWhereClause(filters: StatisticsQuery): {
    clause: string;
    values: any[];
    paramIndex: number;
  } {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // 时间范围条件（必需）
    const timeCondition = this.buildTimeRangeCondition(
      filters.startTime,
      filters.endTime,
      paramIndex
    );
    conditions.push(timeCondition.clause);
    values.push(...timeCondition.values);
    paramIndex += timeCondition.values.length;

    // 应用筛选（可选）
    if (filters.appId) {
      const appCondition = this.buildAppFilter(filters.appId, paramIndex);
      conditions.push(appCondition.clause);
      values.push(...appCondition.values);
      paramIndex += appCondition.values.length;
    }

    // 模型筛选（可选）
    if (filters.modelName) {
      const modelCondition = this.buildModelFilter(filters.modelName, paramIndex);
      conditions.push(modelCondition.clause);
      values.push(...modelCondition.values);
      paramIndex += modelCondition.values.length;
    }

    // 状态筛选（可选）
    if (filters.callStatus) {
      const statusCondition = this.buildStatusFilter(filters.callStatus, paramIndex);
      conditions.push(statusCondition.clause);
      values.push(...statusCondition.values);
      paramIndex += statusCondition.values.length;
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return { clause, values, paramIndex };
  }

  /**
   * 构建时间范围条件
   *
   * 注意：数据库中存储的时间戳是北京时间（UTC+8），但格式化成了 UTC 字符串
   * 因此需要将存储的时间戳转换为真正的 UTC 时间再进行比较
   */
  buildTimeRangeCondition(
    startTime: string,
    endTime: string,
    paramIndex: number
  ): { clause: string; values: any[] } {
    // 将数据库中的时间戳（北京时间）转换为 UTC 时间再比较
    // call_timestamp AT TIME ZONE 'Asia/Shanghai' 表示将时间戳解释为北京时间
    // AT TIME ZONE 'UTC' 表示转换为 UTC 时间
    const clause = `call_timestamp AT TIME ZONE 'Asia/Shanghai' AT TIME ZONE 'UTC' >= $${paramIndex} AND call_timestamp AT TIME ZONE 'Asia/Shanghai' AT TIME ZONE 'UTC' <= $${paramIndex + 1}`;
    const values = [startTime, endTime];
    return { clause, values };
  }

  /**
   * 构建应用筛选条件
   */
  buildAppFilter(appId: string, paramIndex: number): { clause: string; values: any[] } {
    const clause = `app_id = $${paramIndex}`;
    const values = [appId];
    return { clause, values };
  }

  /**
   * 构建模型筛选条件
   */
  buildModelFilter(modelName: string, paramIndex: number): { clause: string; values: any[] } {
    const clause = `model_name = $${paramIndex}`;
    const values = [modelName];
    return { clause, values };
  }

  /**
   * 构建状态筛选条件
   */
  buildStatusFilter(callStatus: string, paramIndex: number): { clause: string; values: any[] } {
    const clause = `call_status = $${paramIndex}`;
    const values = [callStatus];
    return { clause, values };
  }

  /**
   * 构建总览统计查询
   * 返回总调用次数、总 Token 数、总积分消耗和成功率
   */
  buildOverviewQuery(filters: StatisticsQuery): SqlQuery {
    const { clause, values } = this.buildWhereClause(filters);

    const text = `
      SELECT 
        COUNT(*) as total_calls,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(total_points), 0) as total_points,
        COALESCE(
          COUNT(CASE WHEN call_status = 'success' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0),
          0
        ) as success_rate,
        COALESCE(AVG(total_tokens), 0) as avg_tokens_per_call
      FROM model_call_logs
      ${clause}
    `;

    return { text, values };
  }

  /**
   * 构建按应用统计查询
   * 按 app_id 和 app_name 分组，返回每个应用的统计数据
   */
  buildAppStatisticsQuery(filters: StatisticsQuery): SqlQuery {
    const { clause, values, paramIndex } = this.buildWhereClause(filters);

    // 添加分页参数
    const pageNum = filters.pageNum || 1;
    const pageSize = filters.pageSize || 20;
    const offset = (pageNum - 1) * pageSize;

    const text = `
      SELECT 
        app_id,
        app_name,
        COUNT(*) as call_count,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(total_points), 0) as total_points,
        MAX(call_timestamp) as last_call_time
      FROM model_call_logs
      ${clause}
      GROUP BY app_id, app_name
      ORDER BY call_count DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    return { text, values: [...values, pageSize, offset] };
  }

  /**
   * 构建按应用统计总数查询
   * 返回符合条件的应用总数
   */
  buildAppCountQuery(filters: StatisticsQuery): SqlQuery {
    const { clause, values } = this.buildWhereClause(filters);

    const text = `
      SELECT COUNT(DISTINCT app_id) as total
      FROM model_call_logs
      ${clause}
    `;

    return { text, values };
  }

  /**
   * 构建按模型统计查询
   * 按 model_id 和 model_name 分组，返回每个模型的统计数据
   */
  buildModelStatisticsQuery(filters: StatisticsQuery): SqlQuery {
    const { clause, values, paramIndex } = this.buildWhereClause(filters);

    // 添加分页参数
    const pageNum = filters.pageNum || 1;
    const pageSize = filters.pageSize || 20;
    const offset = (pageNum - 1) * pageSize;

    const text = `
      SELECT 
        model_id,
        model_name,
        COUNT(*) as call_count,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(AVG(total_tokens), 0) as avg_tokens_per_call
      FROM model_call_logs
      ${clause}
      GROUP BY model_id, model_name
      ORDER BY call_count DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    return { text, values: [...values, pageSize, offset] };
  }

  /**
   * 构建按模型统计总数查询
   * 返回符合条件的模型总数
   */
  buildModelCountQuery(filters: StatisticsQuery): SqlQuery {
    const { clause, values } = this.buildWhereClause(filters);

    const text = `
      SELECT COUNT(DISTINCT model_id) as total
      FROM model_call_logs
      ${clause}
    `;

    return { text, values };
  }

  /**
   * 构建时间趋势查询
   * 按指定粒度（天/周/月）聚合数据
   */
  buildTrendQuery(filters: StatisticsQuery, granularity: TimeGranularity): SqlQuery {
    const { clause, values } = this.buildWhereClause(filters);

    const text = `
      SELECT 
        DATE_TRUNC('${granularity}', call_timestamp) as timestamp,
        COUNT(*) as call_count,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(total_points), 0) as total_points
      FROM model_call_logs
      ${clause}
      GROUP BY DATE_TRUNC('${granularity}', call_timestamp)
      ORDER BY timestamp ASC
    `;

    return { text, values };
  }

  /**
   * 构建状态统计查询
   * 按 call_status 分组，计算每个状态的数量和占比
   */
  buildStatusQuery(filters: StatisticsQuery): SqlQuery {
    const { clause, values } = this.buildWhereClause(filters);

    const text = `
      SELECT 
        call_status as status,
        COUNT(*) as count,
        COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
      FROM model_call_logs
      ${clause}
      GROUP BY call_status
      ORDER BY count DESC
    `;

    return { text, values };
  }

  /**
   * 构建统计列表查询
   * 按 app_id 和 model_name 分组，返回详细统计数据
   */
  buildStatisticsListQuery(filters: StatisticsQuery): SqlQuery {
    const { clause, values, paramIndex } = this.buildWhereClause(filters);

    const pageNum = filters.pageNum || 1;
    const pageSize = filters.pageSize || 20;
    const offset = (pageNum - 1) * pageSize;

    const text = `
      SELECT 
        app_id,
        app_name,
        model_name,
        usage_scenario,
        COUNT(*) as call_count,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(total_points), 0) as total_points,
        COALESCE(
          COUNT(CASE WHEN call_status = 'success' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0),
          0
        ) as success_rate,
        COALESCE(AVG(total_tokens), 0) as avg_tokens_per_call
      FROM model_call_logs
      ${clause}
      GROUP BY app_id, app_name, model_name, usage_scenario
      ORDER BY app_id ASC,call_count DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    return { text, values: [...values, pageSize, offset] };
  }

  /**
   * 构建统计列表总数查询
   */
  buildStatisticsListCountQuery(filters: StatisticsQuery): SqlQuery {
    const { clause, values } = this.buildWhereClause(filters);

    const text = `
      SELECT COUNT(*) as total
      FROM (
        SELECT app_id, model_name
        FROM model_call_logs
        ${clause}
        GROUP BY app_id, model_name
      ) as subquery
    `;

    return { text, values };
  }
}
