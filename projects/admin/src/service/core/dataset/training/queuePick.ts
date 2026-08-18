/**
 * 训练任务拾取辅助:两次原子查询
 * 1. 普通任务(含 app 创建):lockTime <= now-3min,行为与既有队列一致
 * 2. admin 专属任务:lockTime 为远期值(app 查询不可见),expireAt 承担
 *    admin 内部的 3 分钟冷却(拾取时更新 expireAt = now,lockTime 不动)
 *
 * 独立文件存放,避免 training/utils.ts 与队列模块的循环依赖。
 */
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { addMinutes } from 'date-fns';
import { ADMIN_ONLY_LOCK_THRESHOLD } from './constants';

export const findTrainingTaskWithAdminFallback = async ({
  mode,
  extraFilter = {},
  coolMinutes = 3,
  populate
}: {
  mode: TrainingModeEnum;
  extraFilter?: Record<string, unknown>;
  coolMinutes?: number;
  populate: (query: any) => any;
}) => {
  const baseFilter = { mode, retryCount: { $gt: 0 }, ...extraFilter };

  // 1. 普通任务(含 app 创建的任务,保持兼容)
  const normal = await populate(
    MongoDatasetTraining.findOneAndUpdate(
      { ...baseFilter, lockTime: { $lte: addMinutes(new Date(), -coolMinutes) } },
      { lockTime: new Date(), $inc: { retryCount: -1 } }
    )
  );
  if (normal) return normal;

  // 2. admin 专属任务(lockTime 远期,app 查询条件永远匹配不到)
  return populate(
    MongoDatasetTraining.findOneAndUpdate(
      {
        ...baseFilter,
        lockTime: { $gte: ADMIN_ONLY_LOCK_THRESHOLD },
        expireAt: { $lte: addMinutes(new Date(), -coolMinutes) }
      },
      // 不动 lockTime(持续屏蔽 app),expireAt 承担冷却互斥
      { expireAt: new Date(), $inc: { retryCount: -1 } }
    )
  );
};
