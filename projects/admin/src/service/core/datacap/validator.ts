/**
 * 数据验证服务
 * 负责验证从 MongoDB 提取的数据的完整性和准确性
 */

import type { ModelCallLog, ValidationResult, BatchValidationResult } from '@/types/datacap';

/**
 * 验证模型调用日志的数据格式
 *
 * 验证规则：
 * - callId: 必填，非空字符串
 * - appId: 必填，非空字符串
 * - appName: 可选字符串
 * - modelId: 必填，非空字符串
 * - modelName: 必填，非空字符串
 * - callTimestamp: 必填，有效的日期对象
 * - callStatus: 可选字符串
 * - chatId: 必填，非空字符串
 * - inputTokens: 必填，非负整数
 * - outputTokens: 必填，非负整数
 * - totalTokens: 必填，非负整数
 * - totalPoints: 必填，非负数
 * - source: 可选字符串
 * - sourceName: 可选字符串
 */
function validateModelCallLogSchema(log: ModelCallLog): string[] {
  const errors: string[] = [];

  // 验证 callId
  if (!log.callId || typeof log.callId !== 'string' || log.callId.trim() === '') {
    errors.push('callId: 调用ID不能为空');
  }

  // 验证 appId
  if (!log.appId || typeof log.appId !== 'string' || log.appId.trim() === '') {
    errors.push('appId: 智能体ID不能为空');
  }

  // 验证 modelId
  if (!log.modelId || typeof log.modelId !== 'string' || log.modelId.trim() === '') {
    errors.push('modelId: 模型ID不能为空');
  }

  // 验证 modelName
  if (!log.modelName || typeof log.modelName !== 'string' || log.modelName.trim() === '') {
    errors.push('modelName: 模型名称不能为空');
  }

  // 验证 callTimestamp
  if (!(log.callTimestamp instanceof Date) || isNaN(log.callTimestamp.getTime())) {
    errors.push('callTimestamp: 调用时间戳必须是有效的日期对象');
  }

  // 验证 chatId
  if (!log.chatId || typeof log.chatId !== 'string' || log.chatId.trim() === '') {
    errors.push('chatId: 会话ID不能为空');
  }

  // 验证 inputTokens
  if (typeof log.inputTokens !== 'number' || !Number.isInteger(log.inputTokens)) {
    errors.push('inputTokens: 输入Token必须是整数');
  } else if (log.inputTokens < 0) {
    errors.push('inputTokens: 输入Token必须为非负数');
  }

  // 验证 outputTokens
  if (typeof log.outputTokens !== 'number' || !Number.isInteger(log.outputTokens)) {
    errors.push('outputTokens: 输出Token必须是整数');
  } else if (log.outputTokens < 0) {
    errors.push('outputTokens: 输出Token必须为非负数');
  }

  // 验证 totalTokens
  if (typeof log.totalTokens !== 'number' || !Number.isInteger(log.totalTokens)) {
    errors.push('totalTokens: 总Token必须是整数');
  } else if (log.totalTokens < 0) {
    errors.push('totalTokens: 总Token必须为非负数');
  }

  // 验证 totalPoints
  if (typeof log.totalPoints !== 'number') {
    errors.push('totalPoints: 消耗积分必须是数字');
  } else if (log.totalPoints < 0) {
    errors.push('totalPoints: 消耗积分必须为非负数');
  }

  return errors;
}

/**
 * 数据验证器类
 * 实现 IDataValidator 接口
 */
export class DataValidator {
  /**
   * 数据清洗：处理 null 值和类型转换
   * @param log 原始日志记录
   * @returns 清洗后的日志记录
   */
  private cleanLog(log: any): ModelCallLog {
    return {
      callId: String(log.callId || '').trim(),
      appId: String(log.appId || '').trim(),
      appName: log.appName ? String(log.appName).trim() : '',
      modelId: String(log.modelId || '').trim(),
      modelName: String(log.modelName || '').trim(),
      callTimestamp: this.parseDate(log.callTimestamp),
      callStatus: log.callStatus ? String(log.callStatus).trim() : '',
      chatId: String(log.chatId || log.sessionId || '').trim(),
      dataId: log.dataId ? String(log.dataId).trim() : undefined,
      inputTokens: this.parseNumber(log.inputTokens, 0),
      outputTokens: this.parseNumber(log.outputTokens, 0),
      totalTokens: this.parseNumber(log.totalTokens, 0),
      totalPoints: this.parseNumber(log.totalPoints, 0),
      source: log.source ? String(log.source).trim() : undefined,
      sourceName: log.sourceName ? String(log.sourceName).trim() : undefined,
      modelCategory: String(log.modelCategory || '').trim(),
      usageScenario: String(log.usageScenario || '').trim(),
      runningTime: log.runningTime ? this.parseNumber(log.runningTime) : undefined,
      errorText: log.errorText ? String(log.errorText).trim() : undefined
    };
  }

  /**
   * 解析日期
   * @param value 日期值
   * @returns Date 对象
   */
  private parseDate(value: any): Date {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // 如果无法解析，返回当前时间
    return new Date();
  }

  /**
   * 解析数字
   * @param value 数字值
   * @param defaultValue 默认值
   * @returns 解析后的数字
   */
  private parseNumber(value: any, defaultValue: number = 0): number {
    if (typeof value === 'number' && !isNaN(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }

    return defaultValue;
  }

  /**
   * 验证单条记录
   * @param log 调用记录
   * @returns 验证结果
   */
  validateLog(log: ModelCallLog): ValidationResult {
    try {
      // 先进行数据清洗
      const cleanedLog = this.cleanLog(log);

      // 进行基本格式验证
      const schemaErrors = validateModelCallLogSchema(cleanedLog);

      // 额外的业务逻辑验证
      const businessErrors: string[] = [];

      // 验证 totalTokens 应该等于 inputTokens + outputTokens
      if (cleanedLog.totalTokens !== cleanedLog.inputTokens + cleanedLog.outputTokens) {
        businessErrors.push(
          `总Token数不匹配：totalTokens(${cleanedLog.totalTokens}) != inputTokens(${cleanedLog.inputTokens}) + outputTokens(${cleanedLog.outputTokens})`
        );
      }

      // 验证时间戳不能是未来时间
      if (cleanedLog.callTimestamp > new Date()) {
        businessErrors.push('调用时间戳不能是未来时间');
      }

      // 合并所有错误
      const allErrors = [...schemaErrors, ...businessErrors];

      // 如果有错误，返回验证失败
      if (allErrors.length > 0) {
        return {
          isValid: false,
          errors: allErrors
        };
      }

      return {
        isValid: true,
        errors: []
      };
    } catch (error) {
      // 其他未知错误
      return {
        isValid: false,
        errors: [`验证过程中发生错误: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * 批量验证记录
   * @param logs 调用记录数组
   * @returns 批量验证结果
   */
  validateBatch(logs: ModelCallLog[]): BatchValidationResult {
    const invalidRecords: Array<{
      log: ModelCallLog;
      errors: string[];
    }> = [];

    let validCount = 0;

    // 遍历所有记录进行验证
    for (const log of logs) {
      const result = this.validateLog(log);

      if (result.isValid) {
        validCount++;
      } else {
        invalidRecords.push({
          log,
          errors: result.errors
        });
      }
    }

    return {
      totalCount: logs.length,
      validCount,
      invalidCount: invalidRecords.length,
      invalidRecords
    };
  }

  /**
   * 获取清洗后的有效记录
   * 这是一个辅助方法，用于在批量验证后获取所有有效的记录
   * @param logs 原始记录数组
   * @returns 清洗并验证通过的记录数组
   */
  getValidLogs(logs: ModelCallLog[]): ModelCallLog[] {
    const validLogs: ModelCallLog[] = [];

    for (const log of logs) {
      const cleanedLog = this.cleanLog(log);
      const result = this.validateLog(cleanedLog);

      if (result.isValid) {
        validLogs.push(cleanedLog);
      }
    }

    return validLogs;
  }
}

/**
 * 导出单例实例
 */
export const dataValidator = new DataValidator();
