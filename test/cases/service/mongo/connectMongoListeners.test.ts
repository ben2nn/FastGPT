import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { beforeEach, describe, expect, inject, it, vi } from 'vitest';

// 取消 test/mocks 中对 connectMongo 的 mock，测试真实的监听器管理逻辑
vi.unmock('@fastgpt/service/common/mongo/init');

/**
 * 验证 connectMongo 的监听器管理行为：
 * 1. 重连时不得移除其他模块注册的 disconnected/error 监听器
 *    （回归：曾使用 removeAllListeners 导致 admin 自动重连监控被误删）
 * 2. 重复调用 connectMongo 不得累积自身注册的监听器
 *    （回归：曾导致每次重连多打印一个 "mongo connected"）
 */
describe('connectMongo 监听器管理', () => {
  const getUrl = () => inject('MONGODB_URI');

  beforeEach(async () => {
    await connectMongo({ db: connectionMongo, url: getUrl() });
  });

  it('重连时不移除其他模块注册的 disconnected/error 监听器', async () => {
    const externalDisconnected = vi.fn();
    const externalError = vi.fn();
    connectionMongo.connection.on('disconnected', externalDisconnected);
    connectionMongo.connection.on('error', externalError);

    // 模拟断线重连：disconnect 触发一次 disconnected 事件
    await connectionMongo.disconnect();
    const callsAfterDisconnect = externalDisconnected.mock.calls.length;
    expect(callsAfterDisconnect).toBeGreaterThan(0);

    await connectMongo({ db: connectionMongo, url: getUrl() });

    // 重连后外部监听器必须仍然存在（事件能再次触发）
    connectionMongo.connection.emit('disconnected');
    connectionMongo.connection.emit('error', new Error('test error'));
    expect(externalDisconnected.mock.calls.length).toBe(callsAfterDisconnect + 1);
    expect(externalError).toHaveBeenCalledTimes(1);

    // 清理外部监听器，避免影响其他测试
    connectionMongo.connection.removeListener('disconnected', externalDisconnected);
    connectionMongo.connection.removeListener('error', externalError);
  });

  it('重复断线重连不累积自身注册的监听器', async () => {
    const countBefore = {
      connected: connectionMongo.connection.listenerCount('connected'),
      error: connectionMongo.connection.listenerCount('error'),
      disconnected: connectionMongo.connection.listenerCount('disconnected')
    };

    // 断线重连 3 次
    for (let i = 0; i < 3; i++) {
      await connectionMongo.disconnect();
      await connectMongo({ db: connectionMongo, url: getUrl() });
    }

    expect(connectionMongo.connection.listenerCount('connected')).toBe(countBefore.connected);
    expect(connectionMongo.connection.listenerCount('error')).toBe(countBefore.error);
    expect(connectionMongo.connection.listenerCount('disconnected')).toBe(countBefore.disconnected);
  });
});
