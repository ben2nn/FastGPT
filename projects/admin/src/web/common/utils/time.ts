/**
 * 时间格式化工具函数
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// 启用 UTC 和时区插件
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 将 UTC 时间转换为本地时间字符串
 * @param utcTime UTC 时间字符串（ISO 8601 格式）
 * @param format 输出格式，默认 'YYYY-MM-DD HH:mm:ss'
 * @returns 本地时间字符串
 *
 * @example
 * formatUTCToLocal('2025-11-13T07:12:49.808Z')
 * // 返回: '2025-11-13 15:12:49' (北京时间)
 */
export function formatUTCToLocal(
  utcTime: string | Date,
  format: string = 'YYYY-MM-DD HH:mm:ss'
): string {
  if (!utcTime) return '-';
  return dayjs(utcTime).format(format);
}

/**
 * 将 UTC 时间转换为指定时区的时间字符串
 * @param utcTime UTC 时间字符串（ISO 8601 格式）
 * @param timezone 时区，默认 'Asia/Shanghai'（北京时间）
 * @param format 输出格式，默认 'YYYY-MM-DD HH:mm:ss'
 * @returns 指定时区的时间字符串
 *
 * @example
 * formatUTCToTimezone('2025-11-13T07:12:49.808Z', 'Asia/Shanghai')
 * // 返回: '2025-11-13 15:12:49'
 */
export function formatUTCToTimezone(
  utcTime: string | Date,
  timezone: string = 'Asia/Shanghai',
  format: string = 'YYYY-MM-DD HH:mm:ss'
): string {
  if (!utcTime) return '-';
  return dayjs(utcTime).tz(timezone).format(format);
}

/**
 * 获取当前本地时间的 ISO 字符串（上海时区格式）
 * @returns ISO 8601 格式的上海时区时间字符串
 *
 * @example
 * getCurrentUTCString()
 * // 返回: '2025-11-13T15:12:49+08:00'
 */
export function getCurrentUTCString(): string {
  return dayjs().tz('Asia/Shanghai').format('YYYY-MM-DDTHH:mm:ssZ');
}

/**
 * 获取指定天数前的上海时区时间字符串
 * @param days 天数
 * @returns ISO 8601 格式的上海时区时间字符串
 *
 * @example
 * getUTCStringDaysAgo(7)
 * // 返回 7 天前的上海时区时间
 */
export function getUTCStringDaysAgo(days: number): string {
  return dayjs().subtract(days, 'day').tz('Asia/Shanghai').format('YYYY-MM-DDTHH:mm:ssZ');
}

/**
 * 格式化时间范围显示
 * @param startTime 开始时间（UTC）
 * @param endTime 结束时间（UTC）
 * @returns 格式化的时间范围字符串
 *
 * @example
 * formatTimeRange('2025-11-06T07:12:49.808Z', '2025-11-13T07:12:49.808Z')
 * // 返回: '2025-11-06 15:12:49 ~ 2025-11-13 15:12:49'
 */
export function formatTimeRange(startTime: string | Date, endTime: string | Date): string {
  const start = formatUTCToLocal(startTime);
  const end = formatUTCToLocal(endTime);
  return `${start} ~ ${end}`;
}

/**
 * 格式化相对时间（多久之前）
 * @param time 时间（UTC）
 * @returns 相对时间字符串
 *
 * @example
 * formatRelativeTime('2025-11-13T07:12:49.808Z')
 * // 返回: '刚刚' 或 '5分钟前' 或 '2小时前' 等
 */
export function formatRelativeTime(time: string | Date): string {
  if (!time) return '-';

  const now = dayjs();
  const target = dayjs(time);
  const diffMinutes = now.diff(target, 'minute');
  const diffHours = now.diff(target, 'hour');
  const diffDays = now.diff(target, 'day');

  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;

  return formatUTCToLocal(time, 'YYYY-MM-DD');
}

/**
 * 获取今天开始时间（00:00:00）的上海时区字符串
 * @returns ISO 8601 格式的上海时区时间字符串
 *
 * @example
 * getTodayStartUTC()
 * // 返回: '2025-11-13T00:00:00+08:00' (上海时间 2025-11-13 00:00:00)
 */
export function getTodayStartUTC(): string {
  return dayjs().tz('Asia/Shanghai').startOf('day').format('YYYY-MM-DDTHH:mm:ssZ');
}

/**
 * 获取今天结束时间（23:59:59）的上海时区字符串
 * @returns ISO 8601 格式的上海时区时间字符串
 *
 * @example
 * getTodayEndUTC()
 * // 返回: '2025-11-13T23:59:59+08:00' (上海时间 2025-11-13 23:59:59)
 */
export function getTodayEndUTC(): string {
  return dayjs().tz('Asia/Shanghai').endOf('day').format('YYYY-MM-DDTHH:mm:ssZ');
}

/**
 * 获取指定天数前的开始时间（00:00:00）的上海时区字符串
 * @param days 天数
 * @returns ISO 8601 格式的上海时区时间字符串
 *
 * @example
 * getDaysAgoStartUTC(7)
 * // 返回 7 天前 00:00:00 的上海时区时间
 */
export function getDaysAgoStartUTC(days: number): string {
  return dayjs().subtract(days, 'day').tz('Asia/Shanghai').startOf('day').format('YYYY-MM-DDTHH:mm:ssZ');
}

/**
 * 获取指定天数前的结束时间（23:59:59）的上海时区字符串
 * @param days 天数
 * @returns ISO 8601 格式的上海时区时间字符串
 *
 * @example
 * getDaysAgoEndUTC(7)
 * // 返回 7 天前 23:59:59 的上海时区时间
 */
export function getDaysAgoEndUTC(days: number): string {
  return dayjs().subtract(days, 'day').tz('Asia/Shanghai').endOf('day').format('YYYY-MM-DDTHH:mm:ssZ');
}

/**
 * 获取默认的时间范围（最近 N 天）
 * 从当前时间往前推 N 天
 *
 * @param days 天数，默认 7 天
 * @returns 包含 startTime 和 endTime 的对象
 *
 * @example
 * getDefaultTimeRange(7)
 * // 当前时间: 2025-11-13 15:22:23 (上海时间)
 * // 返回: {
 * //   startTime: '2025-11-06T15:22:23+08:00', // 7天前的当前时刻 (上海时区)
 * //   endTime: '2025-11-13T15:22:23+08:00'    // 当前时间 (上海时区)
 * // }
 */
export function getDefaultTimeRange(days: number = 7): {
  startTime: string;
  endTime: string;
} {
  const now = dayjs().tz('Asia/Shanghai');
  return {
    startTime: now.subtract(days, 'day').format('YYYY-MM-DDTHH:mm:ssZ'), // 当前时间 - N天
    endTime: now.format('YYYY-MM-DDTHH:mm:ssZ') // 当前时间
  };
}
