import { NextEntry } from '@fastgpt/service/common/middle/entry';
import { ensureInitialized } from '@/service/common/task';

/**
 * Admin 项目的 API 中间件入口
 * 确保每次 API 请求前已完成初始化（MongoDB 连接、global.feConfigs 等）
 */
export const NextAPI = NextEntry({
  beforeCallback: [ensureInitialized]
});
