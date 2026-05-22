/**
 * 验证 Cron 表达式 API
 * POST /api/admin/tasks/:taskId/validate-cron
 *
 * 功能：验证 cron 表达式的有效性并返回下次执行时间
 * 权限：需要管理员权限
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';
import cron from 'node-cron';
import { parseExpression } from 'cron-parser';

import { NextAPI } from '@/service/middleware/entry';
import { DEFAULT_TIMEZONE } from '@/web/common/constants';

/**
 * 请求参数类型
 */
export type ValidateCronRequestBody = {
  cronExpression: string;
  timezone?: string;
};

/**
 * 响应类型
 */
export type ValidateCronResponse = {
  valid: boolean;
  message: string;
  nextExecutions?: string[];
  recommendedParams?: Record<string, any>;
};

/**
 * 验证 Cron 表达式 API 处理函数
 */
async function handler(
  req: ApiRequestProps<ValidateCronRequestBody, { taskId: string }>,
  res: ApiResponseType<ValidateCronResponse>
) {
  try {
    // 1. 验证请求方法
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({
        code: 'METHOD_NOT_ALLOWED',
        message: '方法不允许，仅支持 POST 请求'
      } as any);
    }

    // 2. 解析参数
    const { cronExpression, timezone = DEFAULT_TIMEZONE } = req.body;

    if (!cronExpression) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: '缺少必要参数: cronExpression'
      } as any);
    }

    // 3. 验证 cron 表达式
    const isValid = cron.validate(cronExpression);

    if (!isValid) {
      return res.status(200).json({
        valid: false,
        message: 'Cron 表达式格式无效，请检查语法'
      });
    }

    // 4. 计算接下来的 5 次执行时间
    try {
      const interval = parseExpression(cronExpression, {
        currentDate: new Date(),
        tz: timezone
      });

      const nextExecutions: string[] = [];
      for (let i = 0; i < 5; i++) {
        const next = interval.next().toDate();
        nextExecutions.push(next.toISOString());
      }

      // 5. 根据 cron 表达式推荐参数
      const recommendedParams = getRecommendedParams(cronExpression);

      addLog.info('[ValidateCronAPI] Cron 表达式验证成功', {
        cronExpression,
        timezone,
        recommendedParams
      });

      return res.status(200).json({
        valid: true,
        message: 'Cron 表达式有效',
        nextExecutions,
        recommendedParams
      });
    } catch (error) {
      addLog.warn('[ValidateCronAPI] 解析 cron 表达式失败', {
        cronExpression,
        error: error instanceof Error ? error.message : String(error)
      });

      return res.status(200).json({
        valid: false,
        message: '无法解析 Cron 表达式，请检查格式'
      });
    }
  } catch (error) {
    addLog.error('[ValidateCronAPI] 验证失败', error as Error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '验证失败，请稍后重试',
      details: { error: error instanceof Error ? error.message : String(error) }
    } as any);
  }
}

/**
 * 根据 cron 表达式推荐参数
 * @param cronExpression cron 表达式
 * @returns 推荐的参数配置
 */
function getRecommendedParams(cronExpression: string): Record<string, any> {
  const parts = cronExpression.trim().split(/\s+/);

  // cron 表达式格式: 秒 分 时 日 月 周 (6位) 或 分 时 日 月 周 (5位)
  // 例如: 0 2 * * * (每天凌晨2点) - 5位格式
  // 例如: 0 0 2 * * * (每天凌晨2点) - 6位格式
  // 例如: 0 0 * * * * (每小时整点) - 6位格式
  // 例如: 0 */5 * * * * (每5分钟) - 6位格式

  if (parts.length < 5) {
    return {};
  }

  // 根据长度判断格式
  let minute, hour, dayOfMonth, month, dayOfWeek;

  if (parts.length === 6) {
    // 6位格式: 秒 分 时 日 月 周
    [, minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  } else {
    // 5位格式: 分 时 日 月 周
    [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  }

  // 判断是否为每天执行
  // 每天: 小时固定（不是 * 或 */n），日期为 *，周为 * 或不存在
  // 例如: 0 2 * * * (每天凌晨2点) - 5位
  // 例如: 0 0 2 * * * (每天凌晨2点) - 6位
  if (
    hour !== '*' &&
    !hour.includes('/') &&
    !hour.includes(',') &&
    dayOfMonth === '*' &&
    (!month || month === '*') &&
    (!dayOfWeek || dayOfWeek === '*' || dayOfWeek === '?')
  ) {
    return {
      startTime: '{{yesterday.start}}',
      endTime: '{{yesterday.end}}',
      batchSize: 1000
    };
  }

  // 判断是否为每小时或更频繁的执行
  // 每小时: 小时为 * 或 */n，日期为 *
  // 例如: 0 * * * * (每小时) - 5位
  // 例如: 0 0 * * * * (每小时整点) - 6位
  // 例如: 0 */30 * * * * (每30分钟) - 6位
  if (
    (hour === '*' || hour.includes('/') || hour.includes(',')) &&
    dayOfMonth === '*' &&
    (!month || month === '*')
  ) {
    return {
      startTime: '{{lastHour.start}}',
      endTime: '{{lastHour.end}}',
      batchSize: 1000
    };
  }

  // 判断是否为每周执行
  // 每周: 周几固定（不是 * 或 ?）
  // 例如: 0 2 * * 1 (每周一凌晨2点) - 5位
  // 例如: 0 0 2 * * 1 (每周一凌晨2点) - 6位
  if (dayOfWeek && dayOfWeek !== '*' && dayOfWeek !== '?' && !dayOfWeek.includes('/')) {
    return {
      startTime: '{{lastWeek.start}}',
      endTime: '{{lastWeek.end}}',
      batchSize: 1000
    };
  }

  // 判断是否为每月执行
  // 每月: 日期固定（不是 *），月份为 *
  // 例如: 0 2 1 * * (每月1号凌晨2点) - 5位
  // 例如: 0 0 2 1 * * (每月1号凌晨2点) - 6位
  if (
    dayOfMonth !== '*' &&
    !dayOfMonth.includes('/') &&
    !dayOfMonth.includes(',') &&
    (!month || month === '*')
  ) {
    return {
      startTime: '{{lastMonth.start}}',
      endTime: '{{lastMonth.end}}',
      batchSize: 1000
    };
  }

  // 默认返回昨天的参数
  return {
    startTime: '{{yesterday.start}}',
    endTime: '{{yesterday.end}}',
    batchSize: 1000
  };
}

export default NextAPI(handler);
