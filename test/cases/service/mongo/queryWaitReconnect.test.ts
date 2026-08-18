import {
  connectionMongo,
  getMongoModel,
  Schema,
  waitForMongoReady
} from '@fastgpt/service/common/mongo';
import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';

// 取消 test/mocks 中对 connectMongo 的 mock，使用 globalSetup 提供的 MongoMemoryReplSet 真实连接
vi.unmock('@fastgpt/service/common/mongo/init');

const TestSchema = new Schema({ name: String });
const TestModel = getMongoModel('test_query_wait_reconnect', TestSchema);

// 直接操作 mongoose 内部状态模拟断连（readyState 是 prototype getter，tinyspy 对其 spy 会栈溢出）
const setReadyState = (v: number) => {
  (connectionMongo.connection as any)._readyState = v;
};

afterEach(() => {
  vi.restoreAllMocks();
  setReadyState(1); // 确保连接状态不被测试污染
});

/**
 * 验证断连→重连窗口期内的查询等待行为：
 * 1. waitForMongoReady：连接健康时零开销返回；断连时等待恢复；超时返回 false
 * 2. getMongoModel 挂载的 pre hook：断连窗口期发起的查询等待重连成功后正常完成，
 *    而不是立即抛 MongoNotConnectedError（回归：14:58:38 日志中 4 个请求全部 500）
 *
 * 注意：用例间通过修改全局 connection 的 _readyState 模拟断连，必须串行执行
 */
describe.sequential('断连窗口期查询等待重连', () => {
  beforeEach(async () => {
    await connectMongo({ db: connectionMongo, url: inject('MONGODB_URI') });
  });

  it('waitForMongoReady：连接健康时立即返回 true（快路径，不 ping）', async () => {
    const pingSpy = vi.spyOn(connectionMongo.connection.db!, 'admin');

    const start = Date.now();
    const ready = await waitForMongoReady(connectionMongo.connection);
    expect(ready).toBe(true);
    expect(Date.now() - start).toBeLessThan(50);
    expect(pingSpy).not.toHaveBeenCalled();
  });

  it('waitForMongoReady：断连期间等待，连接恢复后返回 true', async () => {
    setReadyState(0); // 模拟断连

    // 400ms 后"重连成功"：恢复 readyState(1)，driver 级连接仍真实可用
    setTimeout(() => setReadyState(1), 400);

    const start = Date.now();
    const ready = await waitForMongoReady(connectionMongo.connection);
    expect(ready).toBe(true);
    expect(Date.now() - start).toBeGreaterThanOrEqual(400);
  });

  it('waitForMongoReady：超时未恢复返回 false', async () => {
    setReadyState(0); // 模拟断连，且一直未恢复

    const start = Date.now();
    const ready = await waitForMongoReady(connectionMongo.connection, 300);
    expect(ready).toBe(false);
    expect(Date.now() - start).toBeGreaterThanOrEqual(300);
  });

  it('pre hook：断连窗口期发起的查询，等待重连成功后正常完成', async () => {
    setReadyState(0); // 模拟断连

    // 500ms 后"重连成功"
    setTimeout(() => setReadyState(1), 500);

    const start = Date.now();
    const result = await TestModel.findOne({ name: 'nonexistent' });
    expect(result).toBeNull();
    // 查询经历了等待期（≥500ms）才执行，而非立即失败
    expect(Date.now() - start).toBeGreaterThanOrEqual(500);
  });

  it('pre hook：连接健康时查询无等待开销', async () => {
    const start = Date.now();
    const result = await TestModel.findOne({ name: 'nonexistent' });
    expect(result).toBeNull();
    // 等待路径至少一轮轮询（200ms），健康时远低于此
    expect(Date.now() - start).toBeLessThan(300);
  });
});
