/**
 * 任务配置文件
 * 定义所有定时任务的配置
 */
import type { TaskConfig } from '@/types/task';
import {
  dataProcessExecutor,
  dataCleanupExecutor,
  reportGenerationExecutor
} from './taskExecutors';

/**
 * 任务配置列表
 */
export const taskConfigs: TaskConfig[] = [
  {
    id: 'data-process',
    name: '数据处理任务',
    description: '处理前一天的数据，生成统计报告',
    cronExpression: '0 2 * * *', // 每天凌晨 2 点执行
    timezone: 'Asia/Shanghai',
    enabled: true,
    executorName: 'dataProcessExecutor',
    defaultParams: {
      // 使用动态参数模板
      startTime: '{{yesterday.start}}',
      endTime: '{{yesterday.end}}',
      batchSize: 1000
    },
    maxExecutionTime: 3600000, // 1 小时
    retryCount: 3,
    retryInterval: 60000, // 1 分钟
    executor: dataProcessExecutor
  },
  {
    id: 'data-cleanup',
    name: '数据清理任务',
    description: '清理 30 天前的过期数据',
    cronExpression: '0 3 * * 0', // 每周日凌晨 3 点执行
    timezone: 'Asia/Shanghai',
    enabled: false,
    executorName: 'dataCleanupExecutor',
    defaultParams: {
      daysToKeep: 30
    },
    maxExecutionTime: 7200000, // 2 小时
    retryCount: 2,
    retryInterval: 300000, // 5 分钟
    executor: dataCleanupExecutor
  },
  {
    id: 'report-generation',
    name: '报告生成任务',
    description: '生成上月的统计报告',
    cronExpression: '0 4 1 * *', // 每月 1 号凌晨 4 点执行
    timezone: 'Asia/Shanghai',
    enabled: false,
    executorName: 'reportGenerationExecutor',
    defaultParams: {
      startTime: '{{lastMonth.start}}',
      endTime: '{{lastMonth.end}}',
      reportType: 'monthly'
    },
    maxExecutionTime: 1800000, // 30 分钟
    retryCount: 3,
    retryInterval: 120000, // 2 分钟
    executor: reportGenerationExecutor
  }
];

/**
 * 根据任务 ID 获取配置
 * @param taskId 任务 ID
 */
export function getTaskConfig(taskId: string): TaskConfig | undefined {
  return taskConfigs.find((config) => config.id === taskId);
}

/**
 * 获取所有任务配置
 */
export function getAllTaskConfigs(): TaskConfig[] {
  return taskConfigs;
}

/**
 * 获取所有启用的任务配置
 */
export function getEnabledTaskConfigs(): TaskConfig[] {
  return taskConfigs.filter((config) => config.enabled);
}
