import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { addMinutes } from 'date-fns';
import { describe, expect, it, vi } from 'vitest';

// 与 projects/admin/src/service/core/dataset/training/utils.ts 的常量保持一致
const ADMIN_ONLY_LOCK_TIME = new Date('2999/5/5');
const ADMIN_ONLY_LOCK_THRESHOLD = new Date('2099/1/1');

// pushDataListToTrainingQueue 依赖模型配置，测试环境无真实配置，mock 掉
vi.mock('@fastgpt/service/core/ai/model', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getEmbeddingModel: () => ({
      model: 'test-emb',
      maxToken: 512,
      batchSize: 10,
      weight: 0,
      dbConfig: {},
      queryConfig: {},
      defaultConfig: {},
      requestUrl: '',
      requestAuth: ''
    }),
    getLLMModel: () => ({ model: 'test-llm', maxToken: 4096 }),
    getVlmModel: () => ({ model: 'test-vlm', maxToken: 4096 })
  };
});

const makeTraining = (overrides: Record<string, unknown> = {}) =>
  MongoDatasetTraining.create({
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    datasetId: new Types.ObjectId(),
    collectionId: new Types.ObjectId(),
    billId: 'test-bill',
    mode: TrainingModeEnum.chunk,
    retryCount: 5,
    ...overrides
  });

/**
 * 训练队列任务隔离机制：
 * admin 创建的任务 lockTime 固定为远期(2999/5/5)，
 * app 队列查询条件(lockTime <= now-3min)永远匹配不到 → app 跳过;
 * admin 队列用专属条件(lockTime >= 2099 且 expireAt <= now-3min)拾取,
 * expireAt 承担 admin 内部的 3 分钟冷却。
 */
describe('admin 专属训练任务隔离(lockTime 远期标记)', () => {
  it('app 语义查询(lockTime <= now-3min)查不到专属任务', async () => {
    await makeTraining({
      lockTime: ADMIN_ONLY_LOCK_TIME,
      expireAt: new Date(Date.now() - 4 * 60 * 1000)
    });

    const appQuery = await MongoDatasetTraining.findOne({
      mode: TrainingModeEnum.chunk,
      retryCount: { $gt: 0 },
      lockTime: { $lte: addMinutes(new Date(), -3) }
    });
    expect(appQuery).toBeNull();
  });

  it('admin 语义查询(lockTime >= 2099 且 expireAt <= now-3min)查到专属任务', async () => {
    await makeTraining({
      lockTime: ADMIN_ONLY_LOCK_TIME,
      expireAt: new Date(Date.now() - 4 * 60 * 1000)
    });

    const adminQuery = await MongoDatasetTraining.findOne({
      mode: TrainingModeEnum.chunk,
      retryCount: { $gt: 0 },
      lockTime: { $gte: ADMIN_ONLY_LOCK_THRESHOLD },
      expireAt: { $lte: addMinutes(new Date(), -3) }
    });
    expect(adminQuery).not.toBeNull();
  });

  it('专属任务 expireAt 冷却:拾取(expireAt=now)后立即不可再查,冷却后重新可查', async () => {
    const t = await makeTraining({
      lockTime: ADMIN_ONLY_LOCK_TIME,
      expireAt: new Date(Date.now() - 4 * 60 * 1000)
    });

    // 模拟 admin 拾取:$set expireAt = now(lockTime 不动)
    await MongoDatasetTraining.updateOne({ _id: t._id }, { expireAt: new Date() });

    const immediate = await MongoDatasetTraining.findOne({
      _id: t._id,
      lockTime: { $gte: ADMIN_ONLY_LOCK_THRESHOLD },
      expireAt: { $lte: addMinutes(new Date(), -3) }
    });
    expect(immediate).toBeNull();

    // 3 分钟冷却后重新可拾取
    await MongoDatasetTraining.updateOne(
      { _id: t._id },
      { expireAt: new Date(Date.now() - 4 * 60 * 1000) }
    );
    const later = await MongoDatasetTraining.findOne({
      _id: t._id,
      lockTime: { $gte: ADMIN_ONLY_LOCK_THRESHOLD },
      expireAt: { $lte: addMinutes(new Date(), -3) }
    });
    expect(later).not.toBeNull();
  });

  it('普通任务(app 创建,lockTime 正常)仍被 app 语义查询命中', async () => {
    await makeTraining({ lockTime: new Date(Date.now() - 4 * 60 * 1000) });

    const appQuery = await MongoDatasetTraining.findOne({
      mode: TrainingModeEnum.chunk,
      retryCount: { $gt: 0 },
      lockTime: { $lte: addMinutes(new Date(), -3) }
    });
    expect(appQuery).not.toBeNull();
  });

  it('pushDataListToTrainingQueue 传 lockTime 时任务携带该值且 expireAt 立即可拾取', async () => {
    await pushDataListToTrainingQueue({
      teamId: new Types.ObjectId().toString(),
      tmbId: new Types.ObjectId().toString(),
      datasetId: new Types.ObjectId().toString(),
      collectionId: new Types.ObjectId().toString(),
      vectorModel: 'test-emb',
      agentModel: 'test-llm',
      billId: 'test-bill-locktime',
      mode: TrainingModeEnum.chunk,
      data: [{ q: '测试问题', chunkIndex: 0 }],
      lockTime: ADMIN_ONLY_LOCK_TIME
    });

    const t = await MongoDatasetTraining.findOne({ billId: 'test-bill-locktime' });
    expect(t).not.toBeNull();
    expect(t?.lockTime?.getTime()).toBe(ADMIN_ONLY_LOCK_TIME.getTime());
    // expireAt 为过去时间:创建后立即可被 admin 拾取(无需等待冷却)
    expect(t!.expireAt!.getTime()).toBeLessThanOrEqual(addMinutes(new Date(), -3).getTime());
  });

  it('pushDataListToTrainingQueue 不传 lockTime 时行为不变(默认冷却时间)', async () => {
    await pushDataListToTrainingQueue({
      teamId: new Types.ObjectId().toString(),
      tmbId: new Types.ObjectId().toString(),
      datasetId: new Types.ObjectId().toString(),
      collectionId: new Types.ObjectId().toString(),
      vectorModel: 'test-emb',
      agentModel: 'test-llm',
      billId: 'test-bill-default',
      mode: TrainingModeEnum.chunk,
      data: [{ q: '测试问题', chunkIndex: 0 }]
    });

    const t = await MongoDatasetTraining.findOne({ billId: 'test-bill-default' });
    expect(t).not.toBeNull();
    // 默认 lockTime(schema default 2000/1/1),应被 app 语义查询命中
    expect(t!.lockTime!.getTime()).toBeLessThan(addMinutes(new Date(), -3).getTime());
  });
});
