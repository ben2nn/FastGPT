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
