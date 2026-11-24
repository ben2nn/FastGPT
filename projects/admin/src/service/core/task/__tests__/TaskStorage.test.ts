/**
 * 任务存储层锁与遗留记录恢复单元测试
 * 覆盖：会话级锁持有连接、同连接解锁、锁探测、恢复逻辑两种分支
 * PostgreSQL 连接池全部 mock
 */

jest.mock('@fastgpt/service/common/system/log', () => ({
  addLog: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() }
}));

import { TaskStorage, RECOVERY_INTERRUPTED_MESSAGE } from '@/service/core/task/TaskStorage';

/** 构造一个 mock 连接：按 SQL 文本返回结果 */
function makeClient(acquired: boolean, released = true) {
  const client: any = {
    query: jest.fn(async (text: string) => {
      if (text.includes('pg_try_advisory_lock')) {
        return { rows: [{ acquired }] };
      }
      if (text.includes('pg_advisory_unlock')) {
        return { rows: [{ released }] };
      }
      return { rows: [] };
    }),
    release: jest.fn()
  };
  return client;
}

/** 构造 mock 连接池：connect 按序返回给定连接，pool.query 由调用方配置 */
function makePool(clients: any[]) {
  const pool: any = {
    connect: jest.fn(async () => clients.shift()),
    query: jest.fn()
  };
  return pool;
}

describe('TaskStorage 会话级任务锁', () => {
  it('acquireLock 成功时返回锁与持有连接，且不归还连接', async () => {
    const client = makeClient(true);
    const pool = makePool([client]);
    const storage = new TaskStorage(pool);

    const held = await storage.acquireLock('task-a');

    expect(held).not.toBeNull();
    expect(held!.client).toBe(client);
    expect(typeof held!.lockId).toBe('number');
    expect(client.query).toHaveBeenCalledWith('SELECT pg_try_advisory_lock($1) as acquired', [
      held!.lockId
    ]);
    expect(client.release).not.toHaveBeenCalled();
  });

  it('acquireLock 失败时返回 null 并归还连接', async () => {
    const client = makeClient(false);
    const pool = makePool([client]);
    const storage = new TaskStorage(pool);

    const held = await storage.acquireLock('task-a');

    expect(held).toBeNull();
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('releaseLock 在同一连接上解锁后归还连接', async () => {
    const client = makeClient(true);
    const pool = makePool([client]);
    const storage = new TaskStorage(pool);

    const held = await storage.acquireLock('task-a');
    await storage.releaseLock(held!);

    expect(client.query).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1) as released', [
      held!.lockId
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('releaseLock 解锁失败仅告警，不抛出且仍归还连接', async () => {
    const client = makeClient(true, false);
    const pool = makePool([client]);
    const storage = new TaskStorage(pool);

    const held = await storage.acquireLock('task-a');
    await expect(storage.releaseLock(held!)).resolves.toBeUndefined();

    expect(client.release).toHaveBeenCalledTimes(1);
  });

  describe('probeLock', () => {
    it('锁可获取时返回 true 并立即解锁归还连接', async () => {
      const client = makeClient(true);
      const pool = makePool([client]);
      const storage = new TaskStorage(pool);

      await expect(storage.probeLock('task-a')).resolves.toBe(true);
      expect(client.query).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1)', [
        expect.any(Number)
      ]);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('锁被占用时返回 false 并归还连接', async () => {
      const client = makeClient(false);
      const pool = makePool([client]);
      const storage = new TaskStorage(pool);

      await expect(storage.probeLock('task-a')).resolves.toBe(false);
      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('recoverStaleExecutions', () => {
    it('锁可获取时标记该任务的 running 记录为 failed，锁被占用的任务跳过', async () => {
      const freeClient = makeClient(true);
      const busyClient = makeClient(false);
      const pool = makePool([freeClient, busyClient]);
      pool.query.mockImplementation(async (text: string) => {
        if (text.includes('SELECT DISTINCT task_id')) {
          return { rows: [{ task_id: 'task-free' }, { task_id: 'task-busy' }] };
        }
        if (text.includes('UPDATE task_executions')) {
          return { rowCount: 2 };
        }
        return { rows: [] };
      });
      const storage = new TaskStorage(pool);

      const recovered = await storage.recoverStaleExecutions();

      expect(recovered).toBe(2);
      // 仅 task-free 执行了 UPDATE；task-busy（锁占用）被跳过
      const updates = pool.query.mock.calls.filter(([text]: [string]) =>
        text.includes('UPDATE task_executions')
      );
      expect(updates).toHaveLength(1);
      expect(updates[0][1][3]).toBe('task-free');
      // 两个连接都已归还
      expect(freeClient.release).toHaveBeenCalledTimes(1);
      expect(busyClient.release).toHaveBeenCalledTimes(1);
    });

    it('锁被占用（其他实例执行中）时跳过，不更新记录', async () => {
      const busyClient = makeClient(false);
      const pool = makePool([busyClient]);
      pool.query.mockImplementation(async (text: string) => {
        if (text.includes('SELECT DISTINCT task_id')) {
          return { rows: [{ task_id: 'task-busy' }] };
        }
        return { rowCount: 0, rows: [] };
      });
      const storage = new TaskStorage(pool);

      const recovered = await storage.recoverStaleExecutions();

      expect(recovered).toBe(0);
      const updates = pool.query.mock.calls.filter(([text]: [string]) =>
        text.includes('UPDATE task_executions')
      );
      expect(updates).toHaveLength(0);
      expect(busyClient.release).toHaveBeenCalledTimes(1);
    });

    it('标记失败时写入恢复提示信息', async () => {
      const freeClient = makeClient(true);
      const pool = makePool([freeClient]);
      pool.query.mockImplementation(async (text: string, params: any[]) => {
        if (text.includes('SELECT DISTINCT task_id')) {
          return { rows: [{ task_id: 'task-free' }] };
        }
        if (text.includes('UPDATE task_executions')) {
          return { rowCount: 1 };
        }
        return { rows: [] };
      });
      const storage = new TaskStorage(pool);

      const recovered = await storage.recoverStaleExecutions();

      expect(recovered).toBe(1);
      const updateCall = pool.query.mock.calls.find(([text]: [string]) =>
        text.includes('UPDATE task_executions')
      );
      expect(updateCall![1][2]).toBe(RECOVERY_INTERRUPTED_MESSAGE);
    });
  });
});
