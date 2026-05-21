/**
 * 任务执行器
 * 定义所有定时任务的执行逻辑
 */
import { addLog } from '@fastgpt/service/common/system/log';

import { dataCapCollect } from '@/service/core/datacap/collect';
import { batchInsertLogs, deleteByTimeRange } from '@/service/core/datacap/storage';

import type { TaskResult } from '@/types/task';

/**
 * 数据处理任务执行器
 * 处理前一天的数据，生成统计报告
 */
export async function dataProcessExecutor(params: Record<string, any>): Promise<TaskResult> {
  try {
    const { startTime, endTime, batchSize } = params;

    addLog.info('开始执行数据处理任务', {
      startTime,
      endTime,
      batchSize
    });

    // 1. 解析时间参数
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    // 2. 清理时间区间内的数据
    addLog.info('开始清理时间区间内的旧数据');
    const deletedCount = await deleteByTimeRange(startDate, endDate);
    addLog.info('旧数据清理完成', {
      deletedCount,
      startTime,
      endTime
    });

    // 3. 使用 DataCapCollect 提取数据
    addLog.info('开始从 MongoDB 提取数据');
    const logs = await dataCapCollect.extractCallLogs(startDate, endDate, batchSize);

    // 4. 获取提取统计信息
    const extractStats = await dataCapCollect.getDataCapStats();

    addLog.info('数据提取完成', {
      extractedCount: logs.length,
      extractStats
    });

    // 5. 存储到 PostgreSQL
    let insertResult: {
      successCount: number;
      failedCount: number;
      duplicateCount: number;
      errors: Array<{ callId: string; error: string }>;
    } = {
      successCount: 0,
      failedCount: 0,
      duplicateCount: 0,
      errors: []
    };

    if (logs.length > 0) {
      addLog.info('开始存储数据到 PostgreSQL');
      insertResult = await batchInsertLogs(logs);

      addLog.info('数据存储完成', {
        successCount: insertResult.successCount,
        duplicateCount: insertResult.duplicateCount,
        failedCount: insertResult.failedCount
      });
    } else {
      addLog.info('没有数据需要存储');
    }

    // 6. 汇总结果
    const totalProcessed = insertResult.successCount + insertResult.duplicateCount;

    addLog.info('数据处理任务完成', {
      deletedCount,
      extractedCount: logs.length,
      storedCount: totalProcessed,
      newRecords: insertResult.successCount,
      duplicateRecords: insertResult.duplicateCount,
      failedRecords: insertResult.failedCount,
      startTime,
      endTime
    });

    return {
      success: true,
      data: {
        deletedCount,
        extractedCount: logs.length,
        storedCount: totalProcessed,
        newRecords: insertResult.successCount,
        duplicateRecords: insertResult.duplicateCount,
        failedRecords: insertResult.failedCount,
        startTime,
        endTime,
        batchSize,
        extractStats,
        insertResult
      },
      message: `数据处理完成：清理 ${deletedCount} 条，提取 ${logs.length} 条，存储 ${totalProcessed} 条（新增 ${insertResult.successCount}，重复 ${insertResult.duplicateCount}，失败 ${insertResult.failedCount}）`
    };
  } catch (error) {
    addLog.error('数据处理任务执行失败', error as Error);
    return {
      success: false,
      message: `数据处理失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 数据清理任务执行器
 * 清理过期的数据
 */
export async function dataCleanupExecutor(params: Record<string, any>): Promise<TaskResult> {
  try {
    const { daysToKeep } = params;

    addLog.info('开始执行数据清理任务', {
      daysToKeep
    });

    // TODO: 实现具体的数据清理逻辑
    // 例如：
    // 1. 计算过期时间点
    // 2. 查询过期数据
    // 3. 删除过期数据
    // 4. 记录清理结果

    // 模拟数据清理
    const deletedCount = 0;

    addLog.info('数据清理任务完成', {
      deletedCount,
      daysToKeep
    });

    return {
      success: true,
      data: {
        deletedCount,
        daysToKeep
      },
      message: '数据清理完成'
    };
  } catch (error) {
    addLog.error('数据清理任务执行失败', error as Error);
    return {
      success: false,
      message: `数据清理失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 报告生成任务执行器
 * 生成统计报告
 */
export async function reportGenerationExecutor(params: Record<string, any>): Promise<TaskResult> {
  try {
    const { startTime, endTime, reportType } = params;

    addLog.info('开始执行报告生成任务', {
      startTime,
      endTime,
      reportType
    });

    // TODO: 实现具体的报告生成逻辑
    // 例如：
    // 1. 查询统计数据
    // 2. 计算各项指标
    // 3. 生成报告文件（PDF、Excel 等）
    // 4. 保存报告到存储系统

    // 模拟报告生成
    const reportUrl = `/reports/${reportType}-${new Date().toISOString().split('T')[0]}.pdf`;

    addLog.info('报告生成任务完成', {
      reportUrl,
      startTime,
      endTime,
      reportType
    });

    return {
      success: true,
      data: {
        reportUrl,
        startTime,
        endTime,
        reportType
      },
      message: '报告生成完成'
    };
  } catch (error) {
    addLog.error('报告生成任务执行失败', error as Error);
    return {
      success: false,
      message: `报告生成失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
