/**
 * TaskManager 实例管理
 * 提供全局的 TaskManager 实例访问
 */
import { addLog } from '@fastgpt/service/common/system/log';

import { TaskManager } from './TaskManager';
import { taskConfigs } from './taskConfigs';
import { getPostgresPool } from '@/service/common/postgres';

// 全局 TaskManager 实例
declare global {
  var __taskManagerInstance: TaskManager | undefined;
  var __taskManagerInitialized: boolean | undefined;
}

/**
 * 获取 TaskManager 实例
 * 如果实例不存在，则创建并初始化
 */
export async function getTaskManager(): Promise<TaskManager> {
  // 如果实例已存在且已初始化，直接返回
  if (global.__taskManagerInstance && global.__taskManagerInitialized) {
    return global.__taskManagerInstance;
  }

  // 创建新实例
  if (!global.__taskManagerInstance) {
    try {
      addLog.info('创建 TaskManager 实例...');
      const pool = getPostgresPool();
      global.__taskManagerInstance = new TaskManager(pool);
    } catch (error) {
      addLog.error('创建 TaskManager 实例失败', error as Error);
      throw error;
    }
  }

  // 初始化实例
  if (!global.__taskManagerInitialized) {
    try {
      addLog.info('初始化 TaskManager...');
      await global.__taskManagerInstance.initialize(taskConfigs);
      global.__taskManagerInitialized = true;
      addLog.info('TaskManager 初始化完成');
    } catch (error) {
      addLog.error('TaskManager 初始化失败', error as Error);
      throw error;
    }
  }

  return global.__taskManagerInstance;
}

/**
 * 检查 TaskManager 是否已初始化
 */
export function isTaskManagerInitialized(): boolean {
  return global.__taskManagerInitialized === true;
}

/**
 * 重置 TaskManager 实例（用于测试）
 */
export function resetTaskManager(): void {
  if (global.__taskManagerInstance) {
    global.__taskManagerInstance.stopAll();
  }
  global.__taskManagerInstance = undefined;
  global.__taskManagerInitialized = false;
}
