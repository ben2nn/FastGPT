/**
 * 数据存储服务批量插入分片测试
 * 覆盖：PostgreSQL 参数上限分片、单条 INSERT 无 RETURNING、单片失败只兜底该片
 */

jest.mock('@fastgpt/service/common/system/log', () => ({
  addLog: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() }
}));

jest.mock('@/service/common/postgres', () => ({
  getPostgresPool: jest.fn()
}));

import { getPostgresPool } from '@/service/common/postgres';
import { batchInsertLogs } from '@/service/core/datacap/storage';
import type { ModelCallLog } from '@/types/datacap';

const COLUMNS_PER_ROW = 19;

function makeLog(index: number): ModelCallLog {
  return {
    callId: `call-${index}`,
    appId: 'app1',
    appName: '应用',
    modelId: 'gpt-4o',
    modelName: 'gpt-4o',
    callTimestamp: new Date('2026-01-01T00:00:00Z'),
    callStatus: 'success',
    chatId: 'chat1',
    inputTokens: 1,
    outputTokens: 2,
    totalTokens: 3,
    totalPoints: 0,
    modelCategory: 'chat',
    usageScenario: 'chatNode'
  };
}

function makeLogs(count: number): ModelCallLog[] {
  return Array.from({ length: count }, (_, i) => makeLog(i));
}

type QueryMock = jest.Mock<Promise<{ rowCount: number | null }>, [string, any[]?]>;

function setupClient() {
  const client = {
    query: jest.fn() as QueryMock,
    release: jest.fn()
  };

  // 默认：事务控制语句返回空；INSERT 全部成功
  client.query.mockImplementation(async (sql: string, params?: any[]) => {
    if (!params) return { rowCount: null };
    return { rowCount: params.length / COLUMNS_PER_ROW };
  });

  (getPostgresPool as jest.Mock).mockReturnValue({
    connect: async () => client
  });

  return client;
}

function insertCalls(client: { query: QueryMock }) {
  return client.query.mock.calls.filter(([, params]) => Array.isArray(params));
}

describe('batchInsertLogs 分片', () => {
  beforeEach(() => {
    (getPostgresPool as jest.Mock).mockReset();
  });

  it('按 PostgreSQL 参数上限分片，每次参数数不超过 65535', async () => {
    const client = setupClient();

    const result = await batchInsertLogs(makeLogs(10000));

    const calls = insertCalls(client);
    // 3000 行/片：3000 + 3000 + 3000 + 1000 = 4 片
    expect(calls).toHaveLength(4);

    const paramCounts = calls.map(([, params]) => (params as any[]).length);
    expect(paramCounts).toEqual([3000 * 19, 3000 * 19, 3000 * 19, 1000 * 19]);
    for (const count of paramCounts) {
      expect(count).toBeLessThanOrEqual(65535);
    }

    expect(result.successCount).toBe(10000);
    expect(result.duplicateCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(client.release).toHaveBeenCalled();
  });

  it('批量 INSERT 不再使用 RETURNING', async () => {
    const client = setupClient();

    await batchInsertLogs(makeLogs(3001));

    const sqls = insertCalls(client).map(([sql]) => sql as string);
    expect(sqls).toHaveLength(2);
    for (const sql of sqls) {
      expect(sql).not.toContain('RETURNING');
      expect(sql).toContain('ON CONFLICT (call_id) DO NOTHING');
    }
  });

  it('某一分片失败时只回滚该片并逐条兜底，其余分片正常写入', async () => {
    const client = setupClient();

    let batchCount = 0;
    client.query.mockImplementation(async (sql: string, params?: any[]) => {
      if (!params) return { rowCount: null };

      // 单片 INSERT 参数数 > 19，逐条 INSERT 恰好 19
      if (params.length > COLUMNS_PER_ROW) {
        batchCount++;
        if (batchCount === 2) {
          throw new Error('bind message has 58504 parameter formats but 0 parameters');
        }
        return { rowCount: params.length / COLUMNS_PER_ROW };
      }

      // 逐条插入
      return { rowCount: 1 };
    });

    const result = await batchInsertLogs(makeLogs(10000));

    // 第 2 片失败后走逐条兜底（3000 条）
    const rowByRowCalls = insertCalls(client).filter(
      ([, params]) => (params as any[]).length === COLUMNS_PER_ROW
    );
    expect(rowByRowCalls).toHaveLength(3000);

    // 单片失败但逐条全部成功，最终全部写入
    expect(result.successCount).toBe(10000);
    expect(result.failedCount).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('逐条兜底中的单条失败计入 failedCount 且错误样本上限 100', async () => {
    const client = setupClient();

    let batchCount = 0;
    client.query.mockImplementation(async (sql: string, params?: any[]) => {
      if (!params) return { rowCount: null };

      if (params.length > COLUMNS_PER_ROW) {
        batchCount++;
        if (batchCount === 1) {
          throw new Error('boom');
        }
        return { rowCount: params.length / COLUMNS_PER_ROW };
      }

      // 逐条插入全部失败
      throw new Error('row insert failed');
    });

    const result = await batchInsertLogs(makeLogs(3000));

    expect(result.successCount).toBe(0);
    expect(result.failedCount).toBe(3000);
    // 错误样本被截断，避免撑爆内存
    expect(result.errors).toHaveLength(100);
  });

  it('空输入不建连接', async () => {
    const client = setupClient();

    const result = await batchInsertLogs([]);

    expect(result.successCount).toBe(0);
    expect(getPostgresPool).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });
});
