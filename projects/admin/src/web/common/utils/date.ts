/**
 * 日期工具函数
 * 用于处理数据提取相关的日期操作
 */

/**
 * 获取昨天的开始时间（00:00:00.000）
 * @returns 昨天的开始时间
 *
 * @example
 * ```typescript
 * const start = getYesterdayStart();
 * // 如果今天是 2024-01-02，返回 2024-01-01 00:00:00.000
 * ```
 */
export function getYesterdayStart(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * 获取昨天的结束时间（23:59:59.999）
 * @returns 昨天的结束时间
 *
 * @example
 * ```typescript
 * const end = getYesterdayEnd();
 * // 如果今天是 2024-01-02，返回 2024-01-01 23:59:59.999
 * ```
 */
export function getYesterdayEnd(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(23, 59, 59, 999);
  return date;
}

/**
 * 获取指定日期的开始时间（00:00:00.000）
 * @param date 指定日期
 * @returns 该日期的开始时间
 *
 * @example
 * ```typescript
 * const start = getStartOfDay(new Date('2024-01-01'));
 * // 返回 2024-01-01 00:00:00.000
 * ```
 */
export function getStartOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * 获取指定日期的结束时间（23:59:59.999）
 * @param date 指定日期
 * @returns 该日期的结束时间
 *
 * @example
 * ```typescript
 * const end = getEndOfDay(new Date('2024-01-01'));
 * // 返回 2024-01-01 23:59:59.999
 * ```
 */
export function getEndOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * 获取指定天数前的日期
 * @param days 天数（正数表示过去，负数表示未来）
 * @returns 指定天数前的日期
 *
 * @example
 * ```typescript
 * const threeDaysAgo = getDaysAgo(3);
 * // 返回3天前的日期
 * ```
 */
export function getDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * 获取指定天数前的日期范围（开始和结束时间）
 * @param days 天数（正数表示过去）
 * @returns 包含开始和结束时间的对象
 *
 * @example
 * ```typescript
 * const { start, end } = getDateRangeForDaysAgo(1);
 * // 返回昨天的开始和结束时间
 * ```
 */
export function getDateRangeForDaysAgo(days: number): {
  start: Date;
  end: Date;
} {
  const date = getDaysAgo(days);
  return {
    start: getStartOfDay(date),
    end: getEndOfDay(date)
  };
}

/**
 * 格式化日期为 ISO 字符串（本地时区）
 * @param date 日期对象
 * @returns ISO 格式的日期字符串
 *
 * @example
 * ```typescript
 * const formatted = formatDateToISO(new Date());
 * // 返回 "2024-01-01T00:00:00.000Z"
 * ```
 */
export function formatDateToISO(date: Date): string {
  return date.toISOString();
}

/**
 * 格式化日期为本地日期字符串
 * @param date 日期对象
 * @param locale 语言环境（默认 'zh-CN'）
 * @returns 本地化的日期字符串
 *
 * @example
 * ```typescript
 * const formatted = formatDateToLocal(new Date());
 * // 返回 "2024年1月1日"
 * ```
 */
export function formatDateToLocal(date: Date, locale: string = 'zh-CN'): string {
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * 格式化日期时间为本地字符串
 * @param date 日期对象
 * @param locale 语言环境（默认 'zh-CN'）
 * @returns 本地化的日期时间字符串
 *
 * @example
 * ```typescript
 * const formatted = formatDateTimeToLocal(new Date());
 * // 返回 "2024年1月1日 00:00:00"
 * ```
 */
export function formatDateTimeToLocal(date: Date, locale: string = 'zh-CN'): string {
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * 检查日期是否有效
 * @param date 日期对象或字符串
 * @returns 是否为有效日期
 *
 * @example
 * ```typescript
 * isValidDate(new Date()); // true
 * isValidDate('invalid'); // false
 * ```
 */
export function isValidDate(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * 计算两个日期之间的天数差
 * @param date1 第一个日期
 * @param date2 第二个日期
 * @returns 天数差（正数表示 date1 在 date2 之后）
 *
 * @example
 * ```typescript
 * const days = getDaysBetween(new Date('2024-01-05'), new Date('2024-01-01'));
 * // 返回 4
 * ```
 */
export function getDaysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000; // 一天的毫秒数
  const diffTime = date1.getTime() - date2.getTime();
  return Math.round(diffTime / oneDay);
}
