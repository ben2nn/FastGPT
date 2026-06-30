import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getInitializationStatus } from '@/service/common/task';
import { testConnection } from '@/service/common/postgres';

/**
 * 系统状态 API
 * 展示系统初始化状态和数据库连接状态
 */
async function handler(_req: ApiRequestProps, res: ApiResponseType) {
  const initStatus = getInitializationStatus();
  const dbConnected = await testConnection();

  return res.status(200).json({
    system: 'FastGPT Admin',
    version: process.env.npm_package_version || '1.0.0',
    initialization: {
      status: initStatus.status,
      startTime: initStatus.startTime,
      endTime: initStatus.endTime,
      duration:
        initStatus.endTime && initStatus.startTime
          ? initStatus.endTime.getTime() - initStatus.startTime.getTime()
          : undefined
    },
    database: {
      connected: dbConnected,
      type: 'PostgreSQL'
    },
    timestamp: new Date().toISOString()
  });
}

// 使用 NextAPI 中间件，确保初始化完成后才处理请求
export default NextAPI(handler);
