/**
 * SSE 端点：推送索引增强进度
 * 前端通过 EventSource 连接此端点获取实时进度
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getProgress } from '@/service/core/dataset/enhanceProgress';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { taskId } = req.query;
  if (!taskId || typeof taskId !== 'string') {
    return res.status(400).json({ error: 'taskId is required' });
  }

  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // 禁用 Next.js 的响应缓冲
  res.flushHeaders();

  const sendEvent = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // 如果已有进度，立即发送
  const initial = getProgress(taskId);
  if (initial) {
    sendEvent(initial);
    if (initial.phase === 'done' || initial.phase === 'error') {
      res.end();
      return;
    }
  }

  // 轮询进度
  const interval = setInterval(() => {
    const progress = getProgress(taskId);
    if (!progress) return;

    sendEvent(progress);

    if (progress.phase === 'done' || progress.phase === 'error') {
      clearInterval(interval);
      res.end();
    }
  }, 500);

  // 客户端断开时清理
  req.on('close', () => {
    clearInterval(interval);
  });
}
