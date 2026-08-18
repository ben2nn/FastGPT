import { delay } from '@fastgpt/global/common/system/utils';
import type { Connection } from 'mongoose';

/**
 * 断连窗口期内查询等待连接恢复的默认超时(ms)
 * 瞬断场景 1s 内恢复，5s 覆盖足够余量；真宕机时避免请求无限挂起
 */
export const MONGO_READY_WAIT_TIMEOUT_MS = 5000;

/**
 * 等待 MongoDB 连接就绪（readyState === 1 且 ping 通过）
 * 断连→重连窗口期内的查询应先等待，连接恢复后继续执行，
 * 避免 MongoNotConnectedError 直接导致请求失败。
 * 谁恢复连接不重要：driver 原生自动恢复、应用层自动重连均可。
 *
 * @returns true = 连接就绪；false = 超时（调用方放行查询，让其自然失败）
 */
export const waitForMongoReady = async (
  conn: Connection,
  timeoutMs: number = MONGO_READY_WAIT_TIMEOUT_MS
): Promise<boolean> => {
  // 快路径：连接健康时零开销返回，不 ping（假死检测由保活定时器负责）
  if (conn.readyState === 1) return true;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // readyState 是动态 getter，每次读取都可能变化；
    // 断言为 number 规避 TS 对首次检查的类型收窄
    if ((conn.readyState as number) === 1) {
      try {
        // readyState 可能先于 driver 实际可用，ping 一次确认
        if (conn.db) {
          await conn.db.admin().ping();
        }
        return true;
      } catch {
        // ping 失败：连接尚未真正可用，继续等待
      }
    }
    await delay(200);
  }
  return false;
};
