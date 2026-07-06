import { connectMongo } from '@fastgpt/service/common/mongo/init';
import {
  connectionMongo,
  connectionLogMongo,
  MONGO_URL,
  MONGO_LOG_URL
} from '@fastgpt/service/common/mongo';
import { addLog } from '@fastgpt/service/common/system/log';

// MongoDB 主库连接超时（connectMongo 内部无限重试，需要外部限制）
const MONGO_CONNECT_TIMEOUT_MS = 60_000;

// 重连状态标志，由 mongoWatch.ts 的 handleReconnect 设置
// 保活检查在此期间跳过重连，避免竞争
let _externalReconnecting = false;
export const setExternalReconnecting = (v: boolean) => {
  _externalReconnecting = v;
};

/**
 * 等待 MongoDB 连接真正就绪（readyState === 1）
 * connectMongo 在 readyState !== 0 时直接返回，不等待 connecting→connected 转换
 * 此函数补充等待，确保 driver 级连接已建立
 */
export async function waitForMongoReady(timeoutMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (connectionMongo.connection.readyState === 1) {
      try {
        // 验证 driver 级连接确实可用
        await connectionMongo.connection.db.admin().ping();
        return true;
      } catch {
        // ping 失败，继续等待
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

// 保活定时器
let keepAliveInterval: NodeJS.Timeout | null = null;
// 保活重连后的回调（由 mongoWatch.ts 设置，用于重建 Change Streams）
let _onKeepAliveReconnect: (() => void) | null = null;
export const setOnKeepAliveReconnect = (cb: (() => void) | null) => {
  _onKeepAliveReconnect = cb;
};

/**
 * 启动 MongoDB 保活机制
 * 定期检查连接状态，断开时自动重连
 */
function startMongoKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  // 每 30 秒检查一次连接状态
  keepAliveInterval = setInterval(async () => {
    const readyState = connectionMongo.connection.readyState;

    // 0 = disconnected, 3 = disconnecting
    if (readyState === 0 || readyState === 3) {
      // 如果 mongoWatch 的 handleReconnect 正在进行，跳过保活重连避免竞争
      if (_externalReconnecting) {
        addLog.info('MongoDB 保活检查：外部重连进行中，跳过');
        return;
      }
      addLog.warn(`MongoDB 保活检查：连接状态异常 (readyState=${readyState})，尝试重连`);
      try {
        await connectMongo({ db: connectionMongo, url: MONGO_URL });
        const ready = await waitForMongoReady(10000);
        if (ready) {
          addLog.info('MongoDB 保活重连成功');
          // 保活重连后重建 Change Streams（旧 streams 在断连时已失效）
          if (_onKeepAliveReconnect) {
            _onKeepAliveReconnect();
          }
        } else {
          addLog.error('MongoDB 保活重连后连接未就绪');
        }
      } catch (error) {
        addLog.error('MongoDB 保活重连失败', error as Error);
      }
    }
  }, 30000);

  // 防止定时器阻止进程退出
  if (keepAliveInterval.unref) {
    keepAliveInterval.unref();
  }

  addLog.info('MongoDB 保活机制已启动（每 30 秒）');
}

/**
 * This function is equivalent to the entry to the service
 * connect MongoDB and init data
 */
export async function connectToMongo() {
  // 主库连接：超时后 disconnect 打断 connectMongo 的内部递归重试
  try {
    await Promise.race([
      connectMongo({ db: connectionMongo, url: MONGO_URL }),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          // disconnect 会使 connectMongo 内部的重试快速失败
          connectionMongo.disconnect().catch(() => {});
          reject(new Error(`MongoDB 主库连接超时（${MONGO_CONNECT_TIMEOUT_MS / 1000}s）`));
        }, MONGO_CONNECT_TIMEOUT_MS)
      )
    ]);
    addLog.info('MongoDB 连接已建立');

    // 验证 driver 级连接确实可用（connectMongo 可能在 readyState=2 时返回）
    const ready = await waitForMongoReady(10000);
    if (!ready) {
      throw new Error('MongoDB 连接建立后 driver 级连接未就绪');
    }

    // 启动保活机制
    startMongoKeepAlive();
  } catch (error) {
    addLog.error('MongoDB 连接错误', error as Error);
    throw error;
  }

  // 连接日志 MongoDB（用于 operationLogs 审计日志写入）
  // admin 项目中 addAuditLog 使用 connectionLogMongo，不连接会缓冲超时
  connectMongo({ db: connectionLogMongo, url: MONGO_LOG_URL }).catch((error) => {
    addLog.warn('MongoDB 日志库连接失败，审计日志将不可用', error);
  });
}
