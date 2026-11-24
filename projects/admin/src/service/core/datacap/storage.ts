import type { PoolClient } from 'pg';

/**
 * 数据采集存储服务
 * 负责将模型调用日志存储到 PostgreSQL
 */

import { addLog } from '@fastgpt/service/common/system/log';
import { getPostgresPool } from '@/service/common/postgres';
import type { ModelCallLog, InsertResult } from '@/types/datacap';
import { SystemError, ErrorType } from '@/service/common/errors';

/** INSERT 每行的列参数个数 */
const INSERT_COLUMNS_PER_ROW = 19;
/**
 * PostgreSQL wire protocol 的 Bind 消息中参数个数是 Int16，上限 65535。
 * 直接把大结果集拼成单条 INSERT 会回绕（420,440 行 × 19 = 7,988,360 → 7,988,360 mod 65,536 = 58,504，
 * 即线上报错 "bind message has 58504 parameter formats"）。3000 行 × 19 = 57,000，留足余量。
 */
const INSERT_CHUNK_ROWS = 3000;
/** 逐条兜底时最多保留的错误样本数，避免整批失败时错误对象撑爆内存 */
const MAX_ERROR_SAMPLES = 100;

const INSERT_COLUMNS_SQL = `call_id, app_id, app_name, model_id, model_name,
        call_timestamp, call_status, chat_id, data_id,
        input_tokens, output_tokens, total_tokens, total_points,
        source, source_name, model_category, usage_scenario, running_time, error_text`;

/** 单条记录对应的 19 个列值（顺序与 INSERT_COLUMNS_SQL 一致） */
function buildRowValues(log: ModelCallLog): any[] {
  return [
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
}

/**
 * 批量插入调用记录
 * 按 PostgreSQL 参数上限分片，每片一个事务；某片失败只回滚该片并转为逐条插入。
 * 依赖 call_id 唯一约束 + ON CONFLICT DO NOTHING，重复执行幂等。
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
  const chunkCount = Math.ceil(logs.length / INSERT_CHUNK_ROWS);

  try {
    addLog.info(
      `开始批量插入 ${logs.length} 条记录（分 ${chunkCount} 片，每片最多 ${INSERT_CHUNK_ROWS} 条）`
    );

    for (let i = 0; i < chunkCount; i++) {
      const chunk = logs.slice(i * INSERT_CHUNK_ROWS, (i + 1) * INSERT_CHUNK_ROWS);

      try {
        const inserted = await insertChunk(client, chunk);
        result.successCount += inserted;
        result.duplicateCount += chunk.length - inserted;
        addLog.debug(`第 ${i + 1}/${chunkCount} 片插入完成`, {
          rows: chunk.length,
          inserted,
          duplicate: chunk.length - inserted
        });
      } catch (error) {
        addLog.error(
          `第 ${i + 1}/${chunkCount} 片批量插入失败，事务已回滚，转为逐条插入（本片 ${chunk.length} 条）`,
          error as Error
        );

        const fallback = await fallbackInsertOneByOne(chunk, client);
        result.successCount += fallback.successCount;
        result.duplicateCount += fallback.duplicateCount;
        result.failedCount += fallback.failedCount;
        result.errors.push(...fallback.errors);
      }

      if ((i + 1) % 10 === 0 || i + 1 === chunkCount) {
        addLog.info(
          `插入进度 ${i + 1}/${chunkCount}：成功 ${result.successCount}，重复 ${result.duplicateCount}，失败 ${result.failedCount}`
        );
      }
    }

    addLog.info('批量插入完成', {
      success: result.successCount,
      duplicate: result.duplicateCount,
      failed: result.failedCount
    });

    return result;
  } finally {
    client.release();
  }
}

/**
 * 执行单个分片的批量插入（独立事务）
 * @returns 实际插入的行数（冲突跳过的不计入）
 */
async function insertChunk(client: PoolClient, chunk: ModelCallLog[]): Promise<number> {
  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const log of chunk) {
    const rowPlaceholders: string[] = [];
    for (let j = 0; j < INSERT_COLUMNS_PER_ROW; j++) {
      rowPlaceholders.push(`$${paramIndex++}`);
    }
    placeholders.push(`(${rowPlaceholders.join(', ')})`);
    values.push(...buildRowValues(log));
  }

  // 不使用 RETURNING：只依赖 rowCount，避免服务端为整片结果构造返回集
  const insertSql = `
    INSERT INTO model_call_logs (${INSERT_COLUMNS_SQL})
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (call_id) DO NOTHING
  `;

  await client.query('BEGIN');
  try {
    const insertResult = await client.query(insertSql, values);
    await client.query('COMMIT');
    return insertResult.rowCount || 0;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

/**
 * 降级方案：逐条插入记录
 * 仅对失败的分片调用，可以获取每条记录的详细错误信息
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
      INSERT INTO model_call_logs (${INSERT_COLUMNS_SQL})
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (call_id) DO NOTHING
    `;

    // 逐条插入
    for (const log of logs) {
      try {
        const insertResult = await client.query(insertSql, buildRowValues(log));

        if (insertResult.rowCount && insertResult.rowCount > 0) {
          result.successCount++;
        } else {
          // 没有插入行，说明是重复记录
          result.duplicateCount++;
        }
      } catch (error) {
        result.failedCount++;
        if (result.errors.length < MAX_ERROR_SAMPLES) {
          result.errors.push({
            callId: log.callId,
            error: (error as Error).message
          });
        }
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
    await client.query('ROLLBACK').catch(() => {});
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
