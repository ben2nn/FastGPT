import type { NextApiRequest, NextApiResponse } from 'next';
import {
  initializeDatabase,
  resetInitializationState,
  getInitializationStatus
} from '@/service/init';
import { addLog } from '@fastgpt/service/common/system/log';

/**
 * 系统初始化 API
 * 用于手动触发数据库初始化或查询初始化状态
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET 请求：查询初始化状态
  if (req.method === 'GET') {
    const status = getInitializationStatus();
    return res.status(200).json({
      status: status.status,
      startTime: status.startTime,
      endTime: status.endTime,
      error: status.error?.message
    });
  }

  // POST 请求：触发初始化
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 GET 和 POST 请求' });
  }

  // 可选：添加认证检查
  const authToken = req.headers.authorization;
  const expectedToken = process.env.INIT_TOKEN || 'your-secret-token';

  if (authToken !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: '未授权' });
  }

  try {
    // 检查是否需要强制重新初始化
    const forceReinit = req.query.force === 'true';

    if (forceReinit) {
      addLog.info('强制重新初始化系统');
      resetInitializationState();
    }

    addLog.info('通过 API 触发系统初始化');
    await initializeDatabase();

    const status = getInitializationStatus();

    return res.status(200).json({
      success: true,
      message: '系统初始化完成',
      status: status.status,
      duration:
        status.endTime && status.startTime
          ? status.endTime.getTime() - status.startTime.getTime()
          : undefined
    });
  } catch (error) {
    addLog.error('系统初始化失败', error as Error);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '初始化失败'
    });
  }
}
