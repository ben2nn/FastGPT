import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { describe, expect, it } from 'vitest';

/**
 * 回归：导入数据时 indexes[].dataId 与 schema required 约束的冲突
 *
 * 背景：commit 1a0405b92 为清除源环境向量 ID，在导入前 delete idx.dataId，
 * 但 schema 中 dataId 为 required: true，Mongoose 8 的 insertMany 在
 * ordered:false 时【静默跳过】校验失败的文档，导致数据整条丢失（无报错）。
 *
 * 修复方案：插入时保留 dataId，插入成功后统一 $unset 清除。
 */

const makeDataDoc = (indexes: Record<string, unknown>[]) => ({
  teamId: new Types.ObjectId(),
  tmbId: new Types.ObjectId(),
  datasetId: new Types.ObjectId(),
  collectionId: new Types.ObjectId(),
  q: '测试问题',
  a: '测试答案',
  indexes
});

describe('导入数据 indexes.dataId 处理', () => {
  it('行为锁定：insertMany ordered:false 对缺 dataId 的文档静默跳过（不抛错、不入库）', async () => {
    const doc = makeDataDoc([{ type: 'custom', text: '无 dataId 的索引' }]);

    // 不抛错，但返回空数组（文档被校验静默丢弃）
    const result = await MongoDatasetData.insertMany([doc], { ordered: false });
    expect(result).toHaveLength(0);

    // 数据没有落库
    const count = await MongoDatasetData.countDocuments({ q: '测试问题' });
    expect(count).toBe(0);
  });

  it('修复路径：dataId 保留时插入成功，$unset 后数据在库且 dataId 已清除', async () => {
    const doc = makeDataDoc([
      { type: 'custom', dataId: '2121433', text: '源环境向量 ID 1' },
      { type: 'default', dataId: '2121434', text: '源环境向量 ID 2' }
    ]);

    // 1. dataId 保留，正常插入（通过 required 校验）
    const inserted = await MongoDatasetData.insertMany([doc], { ordered: false });
    expect(inserted).toHaveLength(1);
    const insertedId = String(inserted[0]._id);

    // 2. 插入成功后统一 $unset 清除源环境向量 dataId
    await MongoDatasetData.updateMany(
      { _id: { $in: [new Types.ObjectId(insertedId)] } },
      { $unset: { 'indexes.$[].dataId': 1 } }
    );

    // 3. 数据仍在库中，且 dataId 已全部清除
    const saved = await MongoDatasetData.findById(insertedId).lean();
    expect(saved).not.toBeNull();
    expect(saved!.q).toBe('测试问题');
    expect(saved!.indexes).toHaveLength(2);
    for (const idx of saved!.indexes) {
      expect(idx.dataId).toBeUndefined();
      expect(idx.text).toBeTruthy();
    }
  });

  it('11000 重复：err.code=11000 且 err.insertedDocs 含成功插入的文档（可恢复成功 _id 集合）', async () => {
    const dupId = new Types.ObjectId();
    const first = { ...makeDataDoc([{ type: 'custom', dataId: '1', text: 'text' }]), _id: dupId };
    const second = {
      ...makeDataDoc([{ type: 'custom', dataId: '2', text: 'text' }]),
      _id: new Types.ObjectId()
    };
    const third = { ...makeDataDoc([{ type: 'custom', dataId: '3', text: 'text' }]), _id: dupId };

    // 库中先存在 first（同 _id 场景）
    await MongoDatasetData.insertMany([first], { ordered: false });

    let caught: any = null;
    try {
      // first 重复（库中已有）、second 新插入成功、third 与 first 同 _id 重复
      await MongoDatasetData.insertMany([first, second, third], { ordered: false });
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    expect(caught.code).toBe(11000);
    expect(Array.isArray(caught.insertedDocs)).toBe(true);

    // 通过 insertedDocs 恢复成功插入的 _id 集合（修复点 2/3 的依据）
    const insertedIds = new Set(
      (caught.insertedDocs as { _id: unknown }[]).map((d) => String(d._id))
    );
    expect(insertedIds.size).toBe(1);
    expect(insertedIds.has(String(second._id))).toBe(true);
    expect(insertedIds.has(String(dupId))).toBe(false);
  });
});
