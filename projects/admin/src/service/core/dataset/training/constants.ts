/**
 * admin 专属训练任务标记常量
 *
 * 原理:app 队列查询条件为 lockTime <= now-3min(无法修改 app 代码),
 * admin 创建的任务将 lockTime 设为远期时间,app 的 watch/轮询永远匹配不到,自然跳过;
 * admin 队列用专属条件(lockTime >= ADMIN_ONLY_LOCK_THRESHOLD)拾取,
 * 互斥冷却由 expireAt 承担(拾取时更新为 now,3 分钟冷却与普通任务语义一致)。
 *
 * 注意:独立文件存放,避免 training/utils.ts 与队列模块的循环依赖。
 */
export const ADMIN_ONLY_LOCK_TIME = new Date('2999/5/5');
export const ADMIN_ONLY_LOCK_THRESHOLD = new Date('2099/1/1');

/**
 * 专属任务初始 expireAt:过去时间,使任务创建后立即可被拾取
 * (队列查询条件为 expireAt <= now-冷却时间;冷却最长为 10 分钟,故回退 10 分钟)。
 * 对 7 天 TTL 的影响可忽略(仅提前 10 分钟)。
 */
export const getAdminOnlyInitialExpireAt = () => new Date(Date.now() - 10 * 60 * 1000);
