/**
 * 全局常量配置
 */

/**
 * 默认时区，可通过环境变量 NEXT_PUBLIC_TIMEZONE 覆盖
 * 用于前端时间显示和后端统计查询中的时区转换
 */
export const DEFAULT_TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || 'Asia/Shanghai';

/**
 * 是否在侧边栏菜单中显示「用户管理」「团队管理」
 * 默认隐藏，设置环境变量 NEXT_PUBLIC_SHOW_USER_TEAM=true 后显示
 * 注意：NEXT_PUBLIC_ 变量在构建时内联，修改后需要重新构建（开发环境需重启 dev server）
 */
export const SHOW_USER_TEAM_MENU = process.env.NEXT_PUBLIC_SHOW_USER_TEAM === 'true';
