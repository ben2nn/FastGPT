# 导入数据重建索引导致数据条数翻倍 — 问题分析与修复设计

## 1. 问题现象

导入数据集（勾选「重建索引」）后，再运行「索引增强」，发现集合中的数据条数变为原来的 2 倍。

## 2. 背景确认（已与用户对齐）

1. **导出数据包含完整 `indexes[].dataId`**：导出接口（[exportByParentId.ts](../../projects/admin/src/pages/api/extend/dataset/exportByParentId.ts)）对 `datas` 全量 `.lean()` 导出，`indexes` 里的 `dataId`（如 `2121433`）会原样带出。但这些 ID 是**源环境的向量 ID，在新环境向量库中不存在**，必须重新 embedding。
2. **导出的数据已经是增强后的格式**：q 为增强摘要、a 带上下文头、indexes 含 custom 关键词 + default 分块（即 `generateEnhanceIndex` 的产出结构）。因此**导入后只需要重建向量索引，不需要再跑「索引增强」**。

## 3. 根因分析

### 3.1 翻倍的直接原因：重建索引任务缺少 `dataId`，走了"新建数据"而不是"更新数据"的分支

导入流程（[importFromJson.ts](../../projects/admin/src/pages/api/extend/dataset/importFromJson.ts)）分两步：

1. **第 11 步**：把导出文件中的 N 条数据直接写入 `MongoDatasetData`（第 379 行），此时数据行已经存在。
2. **第 12 步**：若勾选「重建索引」，为每条数据创建 `mode=chunk` 训练任务（第 414-425 行），但**任务没有携带 `dataId`**：

```typescript
const trainingData = datas.map((data) => ({
  teamId,
  tmbId,
  datasetId: data.datasetId as string,
  collectionId: data.collectionId as string,
  billId: usageId,
  mode: TrainingModeEnum.chunk,
  q: data.q as string,
  a: data.a as string,
  chunkIndex: (data.chunkIndex as number) || 0,
  retryCount: 5
  // ❌ 缺少 dataId: data._id
}));
```

而向量队列 [generateVector.ts](../../projects/admin/src/service/core/dataset/queues/generateVector.ts) 第 124-130 行按 `dataId` 是否存在来区分"重建"与"新建"：

```typescript
if (data.dataId) {
  return rebuildData({ trainingData: data }); // 更新已有数据行 + 替换向量
} else {
  return insertData({ trainingData: data });  // 新建数据行 + 插入向量
}
```

由于任务没有 `dataId`，`generateVector` 走 `insertData()` → `insertData2Dataset()` → `MongoDatasetData.create()`，**对每一条已导入的数据又新建了一条完全相同的数据行**：

```
导入 N 条数据（直接写库）
  + 重建任务 N 个（无 dataId）
      → generateVector 每条都走 insertData
          → 再新建 N 条数据
              = 2N 条数据（翻倍）
```

而正确路径 `rebuildData()`（第 167-256 行）才是为"已有数据重建向量"设计的：它按 `dataId` 定位已有行，用新向量 ID 替换 `indexes`，并删除旧向量。

### 3.2 为什么用户感觉是"跑完增强索引后"翻倍

时序上存在两次时间差：

1. 导入时的重建任务在后台由 `generateVector` 慢慢消化（每条都要调向量模型），数据条数在后台悄悄从 N 涨到 2N；
2. 此时用户去跑「索引增强」，`enhanceIndexes` API 的并发保护（[enhanceIndexes.ts:55-58](../../projects/admin/src/pages/api/core/dataset/training/enhanceIndexes.ts#L55-L58)）会提示"数据集正在训练中"；等重建队列消化完后才能启动增强；
3. 增强对全部 2N 条数据做更新（`generateEnhanceIndex` 只 update 不 insert），完成后用户核对数量，发现翻倍——于是归因到"增强索引"。

**结论：增强索引本身不会新增数据行，翻倍来自导入时的「重建索引」任务缺 `dataId`。**

## 4. 修复方案

### 4.1 主修复：重建任务携带 `dataId`

修改 [importFromJson.ts](../../projects/admin/src/pages/api/extend/dataset/importFromJson.ts) 第 414-425 行：

```typescript
const trainingData = datas.map((data) => ({
  teamId,
  tmbId,
  datasetId: data.datasetId as string,
  collectionId: data.collectionId as string,
  billId: usageId,
  mode: TrainingModeEnum.chunk,
  dataId: data._id as string, // ✅ 指向已导入的数据行，走 rebuildData 更新而非 insertData 新建
  q: data.q as string,
  a: data.a as string,
  chunkIndex: (data.chunkIndex as number) || 0,
  retryCount: 5
}));
```

带上 `dataId` 后，`generateVector` 走 `rebuildData()`：
- 按 `_id` 定位已导入的数据行，重新向量化其 `indexes` 文本（导出的增强索引原文），替换为新的 `dataId`；
- 删除旧向量 ID（源环境 ID 在新向量库中不存在，删除为无害的 no-op）。

重建完成后数据即可直接使用，**无需再跑「索引增强」**（导入的数据已经是增强格式）。

### 4.2 安全加固：导入时清除 indexes 里的旧 dataId

导入的数据 `indexes[].dataId` 是源环境的向量 ID。若新环境恰好使用同类型向量库（如 Milvus int_id 自增），这些旧 ID 可能撞上新环境中**同团队其他数据的向量 ID**，导致 `rebuildData`/`generateEnhanceIndex` 删除旧向量时误删新环境的向量。

建议在导入写入前（[importFromJson.ts](../../projects/admin/src/pages/api/extend/dataset/importFromJson.ts) 第 283 行 `datas.forEach(updateDoc)` 处）将 `indexes` 的 `dataId` 清空：

```typescript
datas.forEach((doc) => {
  updateDoc(doc);
  // 源环境的向量 ID 在新环境无效，清除避免误删同 ID 向量
  (doc.indexes as Array<{ dataId?: string }> | undefined)?.forEach((idx) => {
    delete idx.dataId;
  });
});
```

### 4.3 连带修复：rebuildData 删除旧向量时过滤空 dataId

清除导入数据的 `dataId` 后，[generateVector.ts](../../projects/admin/src/service/core/dataset/queues/generateVector.ts) `rebuildData` 中 `deleteVectorIdList = indexes.map(i => i.dataId)` 会得到全 `undefined` 的数组，传入 `deleteDatasetDataVector` 后：

- PG 向量库生成 `id IN (undefined)` → 报 `invalid input syntax for type integer`；
- Milvus 生成 `(id in [undefined])` → filter 解析错误。

且该删除位于 `mongoSessionRun` 事务内，抛错会回滚整个重建更新，导致重建任务永远失败。修复：与 `generateEnhanceIndex` 的写法对齐，加 `.filter(Boolean)`：

```typescript
const deleteVectorIdList = trainingData.data.indexes
  .map((index) => index.dataId)
  .filter(Boolean) as string[];
```

### 4.3 现有翻倍数据的清理

已翻倍的数据无法自动识别"哪一份是导入的、哪一份是重建新建的"（两者 q/a/chunkIndex 相同）。清理方案：

1. **有备份/可重新导入时（推荐）**：删除整个知识库 → 用修复后的代码重新导入（勾选重建索引）。
2. **无备份时**：按 `(collectionId, q, chunkIndex)` 分组找出重复数据，删除每组中 `updateTime` 较新的那条（新建的那条由 insertData2Dataset 写入，updateTime 一定比导入的晚），随后对该集合跑一次重建，恢复向量一致性。

## 5. 顺带发现的相关问题（建议一并修复）

### 5.1 enhanceIndexes 无排序分页，增强期间可能重复扫描同一数据

[enhanceIndexes.ts:83-87](../../projects/admin/src/pages/api/core/dataset/training/enhanceIndexes.ts#L83-L87) 用 `.skip().limit()` 分批扫描 `MongoDatasetData`，但**没有 `.sort()`**。而 `generateEnhanceIndex` 在 API 还在分页时就并发 `$set` 更新数据行（文档重写会导致自然顺序不稳定），同一数据可能被扫到两次 → 同一 `dataId` 生成两条增强任务 → 并发处理时互相覆盖，先插入的那套向量成为孤儿（永不删除，向量库膨胀、搜索结果重复）。

修复：分页查询加 `.sort({ _id: 1 })` 保证稳定顺序。

### 5.2 generateEnhanceIndex 先插新向量后删旧向量，失败重试会累积孤儿向量

[generateEnhanceIndex.ts:254-288](../../projects/admin/src/service/core/dataset/queues/generateEnhanceIndex.ts#L254-L288) 的顺序是：插入新向量 → 更新数据 → 删除旧向量。任务 `retryCount: 50`，若插入成功后更新/删除步骤失败，重试时会再插一整套新向量，而第一套向量无人引用、永不删除，向量库随之膨胀。

修复建议：重试前先按上次插入的 ID 清理（记录插入结果到训练任务），或将"更新 Mongo + 删旧向量"用 `mongoSessionRun` 事务包裹。

### 5.3 未勾选「重建索引」时导入数据检索不到（提醒）

若导入时不勾选「重建索引」（且按 4.2 清除了旧 dataId），导入数据的 `indexes` 没有有效向量 ID，在新环境的向量库中检索不到。建议在导入 UI 上对未勾选重建的情况给出提示。

## 6. 验证方式

1. 构造一个含 N 条数据的小数据集导出文件（数据为增强后格式，含旧 dataId）；
2. 勾选「重建索引」导入 → 等待队列消化 → 断言集合数据条数为 N（修复前为 2N）；
3. 断言重建后的 `indexes[].dataId` 已替换为新环境的向量 ID，且搜索测试能命中内容；
4. 无需再跑「索引增强」即可检索（验证导入数据已可直接使用）；
5. 对 5.1 的修复：增强运行期间并发更新数据，检查 `MongoDatasetTraining` 中不存在同一 `dataId` 的重复任务。
