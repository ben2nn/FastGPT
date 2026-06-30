import type { NextApiRequest, NextApiResponse } from 'next';
import { testConnection } from '@/service/common/postgres';
import { getInitializationStatus, InitializationStatus } from '@/service/common/task';

/**
 * 健康检查 API
 * 用于检查服务和数据库状态
 */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    // 获取初始化状态
    const initStatus = getInitializationStatus();

    // 测试数据库连接
    const dbConnected = await testConnection();

    const isHealthy = dbConnected && initStatus.status === InitializationStatus.COMPLETED;

    if (!isHealthy) {
      return res.status(503).json({
        status: 'unhealthy',
        database: dbConnected ? 'connected' : 'disconnected',
        initialization: initStatus.status,
        message: !dbConnected
          ? '数据库连接失败'
          : initStatus.status === InitializationStatus.FAILED
            ? '初始化失败'
            : '系统正在初始化',
        error: initStatus.error?.message,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(200).json({
      status: 'healthy',
      database: 'connected',
      initialization: initStatus.status,
      message: '服务运行正常',
      timestamp: new Date().toISOString(),
      uptime:
        initStatus.endTime && initStatus.startTime
          ? initStatus.endTime.getTime() - initStatus.startTime.getTime()
          : undefined
    });
  } catch (error) {
    return res.status(503).json({
      status: 'unhealthy',
      message: error instanceof Error ? error.message : '未知错误',
      timestamp: new Date().toISOString()
    });
  }
}
