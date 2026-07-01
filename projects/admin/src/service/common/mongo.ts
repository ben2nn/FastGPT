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

/**
 * 确保 MongoDB 连接可用
 * 在 API 请求前调用，断开时自动重连
 */
export async function ensureMongoConnected(): Promise<void> {
  // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const readyState = connectionMongo.connection.readyState;

  if (readyState === 1) {
    return; // 已连接
  }

  if (readyState === 2) {
    // 正在连接中，等待完成（带超时）
    addLog.info('MongoDB 正在连接中，等待完成');
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('等待 MongoDB 连接超时')), 30000);
      connectionMongo.connection.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });
      connectionMongo.connection.once('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    return;
  }

  // readyState === 0 或 3：已断开或正在断开
  // connectMongo 内部检查 readyState !== 0 会直接返回，需要先确保完全断开
  if (readyState === 3) {
    addLog.info('MongoDB 正在断开中，等待完成');
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (connectionMongo.connection.readyState === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      // 最多等待 5 秒
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    });
  }

  // 此时 readyState === 0，可以重连
  addLog.warn('MongoDB 连接断开，尝试重连');
  try {
    // 带超时的重连，避免阻塞 API 请求
    await Promise.race([
      connectMongo({ db: connectionMongo, url: MONGO_URL }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('MongoDB 重连超时')), 30000)
      )
    ]);
    addLog.info('MongoDB 重连成功');
  } catch (error) {
    addLog.error('MongoDB 重连失败', error as Error);
    throw error;
  }
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
