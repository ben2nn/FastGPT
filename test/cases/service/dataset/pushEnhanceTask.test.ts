import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { addMinutes } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { pushEnhanceTaskForData } from '../../../../projects/admin/src/service/core/dataset/training/pushEnhanceTask';

// 与 projects/admin/src/service/core/dataset/training/constants.ts 保持一致
const ADMIN_ONLY_LOCK_TIME = new Date('2999/5/5');

const makeTaskParams = (dataId: string, overrides: Record<string, unknown> = {}) => ({
  teamId: new Types.ObjectId().toString(),
  tmbId: new Types.ObjectId().toString(),
  datasetId: new Types.ObjectId().toString(),
  collectionId: new Types.ObjectId().toString(),
  dataId,
  q: '测试切片内容',
  a: '测试答案',
  chunkIndex: 0,
  ...overrides
});

/**
 * insertData / update 接口联动增量增强索引:
 * 数据插入/更新成功后调用 pushEnhanceTaskForData,
 * 将该条数据推入 mode=enhance 训练队列(admin 专属 lockTime 标记),
 * 由 generateEnhanceIndex 异步拾取增强。
 */
describe('pushEnhanceTaskForData(单条数据增量增强入队)', () => {
  it('正常入队:mode=enhance、admin 专属 lockTime、expireAt 立即可拾取、retryCount=50、无 billId', async () => {
    const dataId = new Types.ObjectId().toString();
    const ok = await pushEnhanceTaskForData(makeTaskParams(dataId));
    expect(ok).toBe(true);

    const t = await MongoDatasetTraining.findOne({ dataId });
    expect(t).not.toBeNull();
    expect(t?.mode).toBe(TrainingModeEnum.enhance);
    // admin 专属标记:app 队列查询(lockTime <= now-3min)永远匹配不到
    expect(t?.lockTime?.getTime()).toBe(ADMIN_ONLY_LOCK_TIME.getTime());
    // expireAt 为过去时间:创建后立即可被 admin 队列拾取
    expect(t!.expireAt!.getTime()).toBeLessThanOrEqual(addMinutes(new Date(), -3).getTime());
    expect(t?.retryCount).toBe(50);
    // 按产品决策不创建账单
    expect(t?.billId).toBeUndefined();
    // 快照字段
    expect(t?.q).toBe('测试切片内容');
    expect(t?.a).toBe('测试答案');
    expect(t?.chunkIndex).toBe(0);
  });

  it('空 q 跳过不入队(队列处理器会立即删除无内容任务,不入队更干净)', async () => {
    const dataId = new Types.ObjectId().toString();
    const ok = await pushEnhanceTaskForData(makeTaskParams(dataId, { q: '   ' }));
    expect(ok).toBe(false);
    expect(await MongoDatasetTraining.findOne({ dataId })).toBeNull();
  });

  it('超长切片(q>8000)跳过不入队,与批量 enhanceIndexes 的 chunkLimit 一致', async () => {
    const dataId = new Types.ObjectId().toString();
    const ok = await pushEnhanceTaskForData(makeTaskParams(dataId, { q: 'x'.repeat(8001) }));
    expect(ok).toBe(false);
    expect(await MongoDatasetTraining.findOne({ dataId })).toBeNull();
  });

  it('同 dataId 已有待处理 enhance 任务时去重,不重复入队', async () => {
    const dataId = new Types.ObjectId().toString();
    await MongoDatasetTraining.create({
      ...makeTaskParams(dataId),
      mode: TrainingModeEnum.enhance,
      retryCount: 50,
      lockTime: ADMIN_ONLY_LOCK_TIME,
      expireAt: new Date(Date.now() - 10 * 60 * 1000)
    });

    const ok = await pushEnhanceTaskForData(makeTaskParams(dataId));
    expect(ok).toBe(false);
    const count = await MongoDatasetTraining.countDocuments({
      dataId,
      mode: TrainingModeEnum.enhance
    });
    expect(count).toBe(1);
  });

  it('retryCount=0(已处理完)的旧任务不阻挡再次入队', async () => {
    const dataId = new Types.ObjectId().toString();
    await MongoDatasetTraining.create({
      ...makeTaskParams(dataId),
      mode: TrainingModeEnum.enhance,
      retryCount: 0,
      lockTime: ADMIN_ONLY_LOCK_TIME,
      expireAt: new Date()
    });

    const ok = await pushEnhanceTaskForData(makeTaskParams(dataId));
    expect(ok).toBe(true);
    const pending = await MongoDatasetTraining.findOne({ dataId, retryCount: { $gt: 0 } });
    expect(pending).not.toBeNull();
  });

  it('入队任务 indexes 过滤 summary/question 类型(与批量逻辑一致)', async () => {
    const dataId = new Types.ObjectId().toString();
    const ok = await pushEnhanceTaskForData(
      makeTaskParams(dataId, {
        indexes: [
          { type: DatasetDataIndexTypeEnum.default, text: '默认索引' },
          { type: DatasetDataIndexTypeEnum.custom, text: '自定义标签' },
          { type: DatasetDataIndexTypeEnum.summary, text: '摘要索引' },
          { type: DatasetDataIndexTypeEnum.question, text: '问题索引' }
        ]
      })
    );
    expect(ok).toBe(true);

    const t = await MongoDatasetTraining.findOne({ dataId });
    expect(t?.indexes).toHaveLength(2);
    expect(
      t?.indexes.every(
        (idx) =>
          idx.type !== DatasetDataIndexTypeEnum.summary &&
          idx.type !== DatasetDataIndexTypeEnum.question
      )
    ).toBe(true);
  });
});
