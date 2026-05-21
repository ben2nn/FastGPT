import { NextEntry } from '@fastgpt/service/common/middle/entry';

/**
 * Admin 项目的 API 中间件入口
 * 初始化在服务器启动时自动执行（见 src/service/init.ts）
 */
export const NextAPI = NextEntry({
  beforeCallback: []
});
