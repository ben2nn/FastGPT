# 导入数据为空 + Vector Queue "Not data" 错误根因分析

日期：2026-08-18
状态：已修复（核心修复范围：修复点 1+2+3），测试通过

修复实施记录：
- 修复点 1 最终采用「插入后 $unset」方案（替代文档初稿的 driver 原生插入方案）：
  插入时保留 dataId（通过 schema required 校验），插入成功后统一
  `updateMany({ $unset: { 'indexes.$[].dataId': 1 } })` 清除源环境向量 dataId。
  比 lean/原生插入方案更安全：走 Mongoose 标准插入路径，ObjectId/Date 自动 cast。
- 修复点 2：batchInsert 返回插入成功的 _id 集合，训练任务只针对实际插入的数据创建。
- 修复点 3：11000 处理改用 Mongoose 特供的 err.insertedDocs（成功插入的文档数组）。
- 测试：test/cases/service/dataset/importDataId.test.ts（3 个用例全部通过）：
  1. 行为锁定：insertMany ordered:false 对缺 dataId 文档静默跳过（证明旧方案是数据丢失根因）
  2. 修复路径：dataId 保留插入成功 → $unset 后数据在库且 dataId 已清除
  3. 11000：err.code=11000 且 err.insertedDocs 可恢复成功 _id 集合
- 执行计划见 .claude/plan/import-empty-data-fix.md

## 一、问题现象

1. 导入知识库数据后，界面提示"导入成功"，但目标数据集/集合中数据条数为 0（"空的"）
2. 导入后系统日志刷出大量 `[Vector Queue] Error { message: 'Not data', stack: undefined }`
3. 多次导入尝试均出现同样现象（8-03、8-11、8-14、8-17 的导入痕迹均无数据落库）

## 二、根因分析

### 2.1 直接根因：删除 dataId 与 schema 约束冲突，数据被静默丢弃

commit `1a0405b92` 为修复"导入重建索引导致数据翻倍"，在 `importFromJson.ts` 中新增了清除源环境向量 ID 的逻辑：

```ts
// projects/admin/src/pages/api/extend/dataset/importFromJson.ts (约 287-296 行)
datas.forEach((doc) => {
  const indexes = doc.indexes;
  if (Array.isArray(indexes)) {
    indexes.forEach((idx: Record<string, unknown>) => {
      delete idx.dataId;   // ← 问题源头
    });
  }
});
```

但 [data/schema.ts](../d:/projects/WebStormProjects/nda-fastgpt/packages/service/core/dataset/data/schema.ts) 中：

```ts
indexes: [{
  dataId: { type: String, required: true },   // ← 必填字段
  text: { type: String, required: true }
}]
```

`indexes[].dataId` 是 **required: true**。删除该字段后，文档无法通过 Mongoose 校验。

### 2.2 放大器：Mongoose 8 的 insertMany 在 ordered:false 时静默跳过校验失败的文档

Mongoose 8.12.1 `Model.$__insertMany` 源码（`node_modules/mongoose/lib/model.js`）：

```js
// 第 3049-3060 行：ordered === false 时，校验失败的文档被静默收集，不中断插入
doc.$validate(...).then(
  () => { callback(null, doc); },
  error => {
    if (ordered === false) {
      validationErrors.push(error);
      results[index] = error;
      return callback(null, null);   // ← 静默跳过，不抛错
    }
    callback(error);
  }
);
// 第 3093-3114 行：全部校验失败时直接返回空数组
if (docAttributes.length === 0) {
  ...
  callback(null, []);   // ← 不抛错！batchInsert 拿到 result.length === 0
  return;
}
```

`importFromJson.ts` 的 batchInsert 使用 `model.insertMany(batch, { ordered: false })`，因此：

1. 所有 `indexes` 非空的数据 → 校验失败 → **静默丢弃，无任何报错**
2. `batchInsert` 返回 `insertedCount = 0`，导入 API 继续执行并返回 200 成功
3. 前端 toast "导入成功"

### 2.3 连锁反应：孤儿训练任务 → "Not data"

导入继续执行"创建重建索引训练任务"（`rebuildIndex=true` 时）：

```ts
const trainingData = datas.map((data) => ({ ... dataId: data._id ... }));
```

**训练任务按原始的 `datas` 数组创建，没有过滤掉未实际插入的数据**。而训练任务 schema 中 `lockTime` 默认值为 `new Date('2000/1/1')`，队列查询条件 `lockTime <= now - 3min` 恒成立 → **任务创建后立即被队列处理**。

队列处理时 [generateVector.ts](../d:/projects/WebStormProjects/nda-fastgpt/projects/admin/src/service/core/dataset/queues/generateVector.ts) 走 `rebuildData`：

```ts
const rebuildData = async ({ trainingData }) => {
  if (!trainingData.data) {                     // ← populate 出来是 null（数据从未插入）
    await MongoDatasetTraining.deleteOne(...);  // 删除任务
    return Promise.reject('Not data');          // ← 被外层 catch 打印为 Error 日志
  }
  ...
}
```

即每一条被丢弃的数据对应一条孤儿训练任务 → 一条 `[Vector Queue] Error { message: 'Not data' }` 日志。日志本身是防御性清理（任务会被删除，不会死循环、不会翻倍插入），但它是"数据静默丢失"的症状。

### 2.4 完整因果链

```
导入勾选「重建索引」+ 数据带 indexes
  → importFromJson 删除 indexes[].dataId（防止误删新环境向量，动机正确）
  → 与 schema required: true 冲突
  → Mongoose insertMany ordered:false 静默跳过校验失败文档（无报错）
  → dataset_datas 无数据落库，API 返回 200「导入成功」
  → 训练任务仍按原始 datas 数组全部创建
  → 队列立即处理（lockTime 默认 2000/1/1）→ populate data 为 null
  → "Not data" error 日志 × 数据条数，任务被清理
  → 用户看到：集合存在但数据为 0
```

## 三、证据

1. **Mongoose 源码**：`insertMany` ordered:false 时校验失败静默跳过（model.js 3052-3060、3112 行）
2. **数据库中 0 条"indexes 存在但缺 dataId"的记录**——缺 dataId 的文档从未成功插入过
3. **多个 collection（8-03 至 8-17 创建）全部 dataCount=0**——每次导入都命中同一 bug
4. **审计日志**（北京时间 8-18）：11:54:49 删 collection、11:55:01 队列报 "Not data"×10、11:55:02 删 collection、11:56:20 删数据集——用户看到空后清理了导入产物
5. **训练任务表已清空（0 条）**——孤儿任务全部被 "Not data" 分支清理

## 四、修复方案（待确认）

### 修复点 1：datas 插入绕过 Mongoose 校验（根因修复）

导入时对 datas 手动 cast ObjectId 字段后，使用 driver 原生 `collection.insertMany` 插入，保留"清除 dataId"的逻辑：

```ts
// importFromJson.ts，datas 插入前
for (const doc of datas) {
  doc._id = new Types.ObjectId(String(doc._id));
  doc.datasetId = new Types.ObjectId(String(doc.datasetId));
  doc.collectionId = new Types.ObjectId(String(doc.collectionId));
  doc.teamId = new Types.ObjectId(String(doc.teamId));
  doc.tmbId = new Types.ObjectId(String(doc.tmbId));
}
await MongoDatasetData.collection.insertMany(datas, { ordered: false });
```

不选 `lean: true`（Mongoose insertMany 选项）：lean 同样绕过校验，但 `_id` 等 ObjectId 字段不会被 cast，会以字符串存储，导致后续查询 cast 成 ObjectId 后查不到数据（"数据存在但看不见"的新 bug）。

不选改 schema 的 `required: false`：packages/service 为共享代码，影响主 app 所有写入路径，风险大。

### 修复点 2：训练任务只为实际插入的数据创建

batchInsert 返回实际插入成功的 `_id` 列表，创建训练任务时过滤：

```ts
const insertedIds = new Set(await batchInsert(MongoDatasetData, datas, 'datas'));
const trainingData = datas
  .filter((data) => insertedIds.has(String(data._id)))
  .map((data) => ({ ... }));
```

即使仍有数据被跳过（如 11000 重复），也不会产生孤儿训练任务（"Not data" 不再出现）。

### 修复点 3：适配 mongodb driver 6 的 BulkWriteError 结构

当前 batchInsert 的 11000 处理基于 driver 4 的 `err.result.insertedCount`，driver 6 中该属性已移除（改用 `err.insertedDocs` / `err.writeErrors`）：

```ts
} catch (err: unknown) {
  const bulkErr = err as { code?: number; insertedDocs?: unknown[]; writeErrors?: unknown[] };
  if (bulkErr.code === 11000) {
    const inserted = bulkErr.insertedDocs?.length ?? 0;
    insertedCount += inserted;
    duplicateWarnings.push(`${name}: ${batch.length - inserted} 条重复已跳过`);
  } else {
    throw err;
  }
}
```

### 修复点 4（可选）：删除 collection/数据集时清理训练任务

删除数据/集合/数据集时同步 `MongoDatasetTraining.deleteMany`，避免产生孤儿任务（"Not data" 的另一个来源，本次 11:54-11:56 删除操作也触发了一批）。

## 五、"Not data" 日志本身的定位

该日志是队列对"训练任务指向的数据不存在"的防御性清理：删除任务并记 error。清理行为无害（不会翻倍插入、不会死循环）。**但正常导入流程不应出现该日志**——出现即说明存在孤儿训练任务（数据被删或从未插入）。修复点 2、4 后，仅"删除数据但任务残留"的旧数据场景仍可能短暂出现，属预期内清理。
