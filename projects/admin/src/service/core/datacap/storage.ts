import type { PoolClient } from 'pg';

/**
 * 数据采集存储服务
 * 负责将模型调用日志存储到 PostgreSQL
 */

import { addLog } from '@fastgpt/service/common/system/log';
import { getPostgresPool } from '@/service/common/postgres';
import type { ModelCallLog, InsertResult } from '@/types/datacap';
import { SystemError, ErrorType } from '@/service/common/errors';

/**
 * 批量插入调用记录
 * 使用参数化查询防止 SQL 注入，通过事务确保数据一致性
 */
export async function batchInsertLogs(logs: ModelCallLog[]): Promise<InsertResult> {
  if (logs.length === 0) {
    return {
      successCount: 0,
      failedCount: 0,
      duplicateCount: 0,
      errors: []
    };
  }

  const pool = getPostgresPool();
  const result: InsertResult = {
    successCount: 0,
    failedCount: 0,
    duplicateCount: 0,
    errors: []
  };

  const client = await pool.connect();

  try {
    addLog.info(`开始批量插入 ${logs.length} 条记录`);

    // 开始事务，确保数据一致性
    await client.query('BEGIN');

    // 构建批量插入的 SQL 语句
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];

      // 为每条记录创建占位符 ($1, $2, ..., $18)
      const rowPlaceholders = [];
      for (let j = 0; j < 19; j++) {
        rowPlaceholders.push(`$${paramIndex++}`);
      }
      placeholders.push(`(${rowPlaceholders.join(', ')})`);

      // 添加参数值
      values.push(
        log.callId,
        log.appId,
        log.appName || null,
        log.modelId,
        log.modelName,
        log.callTimestamp,
        log.callStatus || null,
        log.chatId,
        log.dataId || null,
        log.inputTokens || 0,
        log.outputTokens || 0,
        log.totalTokens || 0,
        log.totalPoints || 0,
        log.source || null,
        log.sourceName || null,
        log.modelCategory || 'chat',
        log.usageScenario || null,
        log.runningTime || null,
        log.errorText || null
      );
    }

    // 执行批量插入
    // ON CONFLICT 实现重复记录检测（基于 call_id 唯一约束）
    const insertSql = `
      INSERT INTO model_call_logs (
        call_id, app_id, app_name, model_id, model_name,
        call_timestamp, call_status, chat_id, data_id,
        input_tokens, output_tokens, total_tokens, total_points,
        source, source_name, model_category, usage_scenario, running_time, error_text
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (call_id) DO NOTHING
      RETURNING call_id
    `;

    const insertResult = await client.query(insertSql, values);

    // 统计插入结果
    result.successCount = insertResult.rowCount || 0;
    result.duplicateCount = logs.length - result.successCount;

    // 提交事务
    await client.query('COMMIT');

    addLog.info('批量插入完成', {
      success: result.successCount,
      duplicate: result.duplicateCount,
      failed: result.failedCount
    });

    return result;
  } catch (error) {
    // 错误处理：回滚事务以保证数据一致性
    await client.query('ROLLBACK');
    addLog.error('批量插入失败，事务已回滚', error as Error);

    // 如果批量插入失败，尝试逐条插入以获取详细错误信息
    addLog.info('尝试逐条插入以识别问题记录');
    return await fallbackInsertOneByOne(logs, client);
  } finally {
    client.release();
  }
}

/**
 * 降级方案：逐条插入记录
 * 当批量插入失败时使用，可以获取每条记录的详细错误信息
 */
async function fallbackInsertOneByOne(
  logs: ModelCallLog[],
  client: PoolClient
): Promise<InsertResult> {
  const result: InsertResult = {
    successCount: 0,
    failedCount: 0,
    duplicateCount: 0,
    errors: []
  };

  try {
    // 开始新事务
    await client.query('BEGIN');

    const insertSql = `
      INSERT INTO model_call_logs (
        call_id, app_id, app_name, model_id, model_name,
        call_timestamp, call_status, chat_id, data_id,
        input_tokens, output_tokens, total_tokens, total_points,
        source, source_name, model_category, usage_scenario, running_time, error_text
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (call_id) DO NOTHING
      RETURNING id
    `;

    // 逐条插入
    for (const log of logs) {
      try {
        const values = [
          log.callId,
          log.appId,
          log.appName || null,
          log.modelId,
          log.modelName,
          log.callTimestamp,
          log.callStatus || null,
          log.chatId,
          log.dataId || null,
          log.inputTokens || 0,
          log.outputTokens || 0,
          log.totalTokens || 0,
          log.totalPoints || 0,
          log.source || null,
          log.sourceName || null,
          log.modelCategory || 'chat',
          log.usageScenario || null,
          log.runningTime || null,
          log.errorText || null
        ];

        const insertResult = await client.query(insertSql, values);

        if (insertResult.rowCount && insertResult.rowCount > 0) {
          result.successCount++;
        } else {
          // 没有插入行，说明是重复记录
          result.duplicateCount++;
        }
      } catch (error) {
        result.failedCount++;
        result.errors.push({
          callId: log.callId,
          error: (error as Error).message
        });
        addLog.error(`插入记录失败 (callId: ${log.callId})`, error as Error);
      }
    }

    // 提交事务
    await client.query('COMMIT');

    addLog.info('逐条插入完成', {
      success: result.successCount,
      duplicate: result.duplicateCount,
      failed: result.failedCount
    });

    return result;
  } catch (error) {
    // 回滚事务
    await client.query('ROLLBACK');
    addLog.error('逐条插入也失败', error as Error);
    throw new SystemError(
      ErrorType.DATA_INSERTION_ERROR,
      '批量插入和逐条插入均失败',
      error as Error
    );
  }
}

/**
 * 检查记录是否已存在
 */
export async function checkRecordExists(callId: string): Promise<boolean> {
  try {
    const pool = getPostgresPool();
    const result = await pool.query('SELECT 1 FROM model_call_logs WHERE call_id = $1 LIMIT 1', [
      callId
    ]);
    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    addLog.error(`检查记录存在性失败 (callId: ${callId})`, error as Error);
    throw new SystemError(
      ErrorType.POSTGRES_CONNECTION_ERROR,
      '检查记录存在性失败',
      error as Error
    );
  }
}

/**
 * 删除指定时间范围的记录
 */
export async function deleteByTimeRange(startDate: Date, endDate: Date): Promise<number> {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    const deleteQuery = `
      DELETE FROM model_call_logs
      WHERE call_timestamp >= $1 AND call_timestamp <= $2
    `;

    const result = await client.query(deleteQuery, [startDate, endDate]);

    addLog.info('删除记录完成', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      deletedCount: result.rowCount || 0
    });

    return result.rowCount || 0;
  } catch (error) {
    addLog.error('删除记录失败', error as Error);
    throw new SystemError(
      ErrorType.DATABASE_ERROR,
      `删除记录失败: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  } finally {
    client.release();
  }
}

/**
 * 获取指定时间范围的记录数
 */
export async function getRecordCount(startDate: Date, endDate: Date): Promise<number> {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    const countQuery = `
      SELECT COUNT(*) as count
      FROM model_call_logs
      WHERE call_timestamp >= $1 AND call_timestamp <= $2
    `;

    const result = await client.query(countQuery, [startDate, endDate]);

    return parseInt(result.rows[0]?.count || '0', 10);
  } catch (error) {
    addLog.error('获取记录数失败', error as Error);
    return 0;
  } finally {
    client.release();
  }
}
