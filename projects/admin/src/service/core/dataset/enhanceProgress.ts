/**
 * 索引增强进度追踪
 * 使用内存 Map 存储进度，通过 SSE 推送到前端
 */

type ProgressData = {
  current: number;
  total: number;
  phase: 'reading' | 'chunking' | 'enhancing' | 'pushing' | 'done' | 'error';
  message?: string;
};

const progressMap = new Map<string, ProgressData>();

// 5 分钟后自动清理
const CLEANUP_TIMEOUT = 5 * 60 * 1000;

export const setProgress = (taskId: string, data: ProgressData) => {
  progressMap.set(taskId, data);
  // 完成或出错时延迟清理
  if (data.phase === 'done' || data.phase === 'error') {
    setTimeout(() => progressMap.delete(taskId), CLEANUP_TIMEOUT);
  }
};

export const getProgress = (taskId: string): ProgressData | undefined => {
  return progressMap.get(taskId);
};

export const deleteProgress = (taskId: string) => {
  progressMap.delete(taskId);
};

/**
 * 生成随机任务 ID
 */
export const generateTaskId = (): string => {
  return `enhance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};
