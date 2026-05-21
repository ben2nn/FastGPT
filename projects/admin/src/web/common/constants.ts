/**
 * 全局常量配置
 */

/**
 * 默认时区，可通过环境变量 NEXT_PUBLIC_TIMEZONE 覆盖
 * 用于前端时间显示和后端统计查询中的时区转换
 */
export const DEFAULT_TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || 'Asia/Shanghai';
