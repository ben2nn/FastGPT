import { NextEntry, type NextApiHandler } from '@fastgpt/service/common/middle/entry';
import { ensureInitialized } from '@/service/common/task';
import { ensureMongoConnected } from '@/service/common/mongo';

/**
 * Admin 项目的 API 中间件入口
 * 通过最后一个参数 `{ middleware }` 指定需要的中间件：
 * - 'mongo'（默认）: 仅 MongoDB
 * - 'pg': 仅 PostgreSQL（任务管理、数据统计等）
 * - 'all': MongoDB + PostgreSQL（跨库操作）
 *
 * @example
 * export default NextAPI(handler);
 * export default NextAPI(handler, { middleware: 'all' });
 * export default NextAPI(handler1, handler2, { middleware: 'pg' });
 */

type MiddlewarePreset = 'mongo' | 'pg' | 'all';

const middlewarePresets = {
  mongo: NextEntry({ beforeCallback: [ensureMongoConnected] }),
  pg: NextEntry({ beforeCallback: [ensureInitialized] }),
  all: NextEntry({ beforeCallback: [ensureMongoConnected, ensureInitialized] })
} as const;

function isMiddlewareOption(arg: unknown): arg is { middleware: MiddlewarePreset } {
  return typeof arg === 'object' && arg !== null && 'middleware' in arg;
}

export function NextAPI(...args: any[]): NextApiHandler {
  const lastArg = args[args.length - 1];

  if (isMiddlewareOption(lastArg)) {
    const handlers: NextApiHandler[] = args.slice(0, -1);
    return middlewarePresets[lastArg.middleware](...handlers);
  }

  return middlewarePresets.mongo(...args);
}
