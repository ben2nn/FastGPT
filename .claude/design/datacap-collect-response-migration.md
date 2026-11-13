# 数据采集模块适配新版会话消息结构

## 1. 问题现象

admin 端数据采集任务（`dataProcessExecutor` → `DataCapCollect.extractCallLogs`）执行成功但
`extractedCount = 0`，PostgreSQL `model_call_logs` 无新增记录，且无报错。

## 2. 根因分析

### 2.1 存储结构变更

FastGPT 当前版本在 `packages/service/core/chat/saveChat.ts` 中把节点调用明细拆分为独立集合：

```ts
// saveChat.ts
const { responseData, ...aiResponse } = aiContent;   // responseData 不再写入 chatitems

await MongoChatItem.create(processedContent.map(...)); // 只写会话消息本体

await MongoChatItemResponse.create(
  nodeResponses.map((item) => ({
    teamId, appId, chatId,
    chatItemDataId: dataId,   // 关联 chatitems.dataId（AI 消息）
    data: item                // 单条节点响应
  }))
);
```

| | 旧结构 | 当前结构 |
|---|---|---|
| 集合 | `chatitems` | `chat_item_responses`（`ChatItemResponseCollectionName`） |
| 字段 | `responseData: Array` | `data: Object`（一条文档一条节点响应） |
| 关联 | 内嵌 | `chatItemDataId` = `chatitems.dataId`（AI 消息） |
| `chatitems.responseData` | 唯一来源 | 标记 `@deprecated`，**新数据不再写入** |

节点响应对象本身的字段未变（`id`、`nodeId`、`moduleType`、`moduleName`、`model`、
`inputTokens`、`outputTokens`、`totalPoints`、`runningTime`、`errorText` 等由
`dispatch/index.ts` 统一补齐）。

### 2.2 采集失败原因

[collect.ts](../../projects/admin/src/service/core/datacap/collect.ts) 的聚合管道（第 181-234 行）仍按旧结构编写：

```js
{ $unwind: { path: '$responseData', preserveNullAndEmptyArrays: true } },
{ $match: { 'responseData.moduleType': { $in: [...] } } }
```

新数据中 `chatitems.responseData` 不存在 → `$unwind` 后该字段被丢弃 → `$match` 过滤掉全部文档 →
聚合结果为空。任务本身不抛异常，所以表现为“成功但 0 条”。

### 2.3 顺带发现的其他缺陷

1. **会话集合名错误**：`$lookup.from` 写的是 `'chat'`，实际集合名为 `chats`
   （`chatCollectionName`），导致 `source` / `sourceName` 一直为空。
2. **分页会提前结束**：`extractBatch` 在 `$unwind + $match` 之后 `$skip/$limit`，
   而循环用“本批返回条数 < batchSize”判断结束。一批 AI 消息中只要部分响应被过滤，
   就会误判为最后一页。
3. **每批 4 次全表级调试查询**：`countDocuments(Human)`、`countDocuments(AI)`、
   `findOne(Human)`、`findOne(AI)` 在**每个批次**都执行一遍，且读取的是已废弃字段
   `chatitems.responseData`，日志具有误导性。
4. **`getRecordCount` 依赖已废弃字段** `responseData: { $exists: true, $ne: [] }`，
   恒为 0。
5. **model 兜底取的是草稿工作流**：模型为空时从 `apps.modules` 按 `nodeId` 提取，
   但会话实际运行的是 `chats.appVersionId` 对应的 `app_versions.nodes`，两者可能不一致。

## 3. 修复方案

仅改动 `projects/admin/src/service/core/datacap/collect.ts`，输出 `ModelCallLog` 契约不变，
`storage.ts` / `validator.ts` / `taskExecutors.ts` 无需调整。

### 3.1 数据源切换 + 新旧兼容

在 `chatitems` 之后用 `$lookup` 关联 `chat_item_responses`，再与旧字段合并：

```js
{
  $lookup: {
    from: ChatItemResponseCollectionName,       // 'chat_item_responses'
    let: { appId: '$appId', chatId: '$chatId', dataId: '$dataId' },
    pipeline: [
      {
        $match: {
          $expr: {
            $and: [
              { $eq: ['$appId', '$$appId'] },
              { $eq: ['$chatId', '$$chatId'] },
              { $eq: ['$chatItemDataId', '$$dataId'] }
            ]
          }
        }
      },
      { $sort: { _id: 1 } }
    ],
    as: 'responseDocs'
  }
},
{
  $addFields: {
    responseData: {
      $concatArrays: [
        { $map: { input: '$responseDocs', as: 'r', in: '$$r.data' } }, // 新结构
        { $ifNull: ['$responseData', []] }                              // 旧结构兼容
      ]
    }
  }
},
{ $unwind: '$responseData' },
{ $match: { 'responseData.moduleType': { $in: ['chatNode', 'classifyQuestion', 'contentExtract', 'tools', 'cfr'] } } }
```

`$lookup` 可命中 `chat_item_responses` 的 `{ appId, chatId, chatItemDataId }` 索引。
后续 `$project` 中所有 `$responseData.*` 引用保持不变。

### 3.2 分页改为 `_id` 游标

废弃 `$skip`，改用 `ObjectId` 游标按 AI 消息分页，避免大偏移量扫描和“提前结束”：

1. `extractCallLogs` 维护 `lastId: Types.ObjectId | null`；
2. `extractBatch` 先轻量查询本批消息 ID：

```ts
const batchItems = await MongoChatItem.find(
  { obj: 'AI', time: { $gte: startDate, $lte: endDate }, ...(lastId && { _id: { $gt: lastId } }) },
  '_id'
).sort({ _id: 1 }).limit(limit).lean();
```

3. 聚合管道以 `{ _id: { $in: batchItems.map(i => i._id) } }` 为起点；
4. 返回 `{ logs, lastId: 本批最后一个 _id, scannedCount: batchItems.length }`；
5. 循环终止条件：`scannedCount === 0` 或 `scannedCount < batchSize`。

一个 AI 消息可能对应多条节点响应，因此 `lastId` 以**消息**为粒度、结果条数可大于 `batchSize`，
这与原语义的差异需要在日志中说明。

### 3.3 集合名修正

- `$lookup.from: 'chat'` → `chatCollectionName`（`'chats'`）；
- 会话关联增加 `appId` 约束（同一 `chatId` 可存在于多个 app）：

```js
{
  $lookup: {
    from: chatCollectionName,
    let: { appId: '$appId', chatId: '$chatId' },
    pipeline: [{
      $match: { $expr: { $and: [{ $eq: ['$appId', '$$appId'] }, { $eq: ['$chatId', '$$chatId'] }] } }
    }],
    as: 'chatInfo'
  }
}
```

### 3.4 model 兜底取运行时版本节点

`apps` 关联后，再按 `chatInfo.appVersionId` 关联 `app_versions`（`_id`），
`$addFields: { nodesForModel: 版本 nodes 非空 ? 版本 nodes : appInfo.modules }`，
`$project` 中 model/modelName/`_debug` 统一引用 `$nodesForModel`。

### 3.5 清理误导性调试查询

删除每批的 `countDocuments(Human/AI)`、`findOne(Human/AI)` 调试块；
保留批次日志、`Model 提取统计`、`unknown` 抽样告警。

### 3.6 `getRecordCount` 调整

改为统计时间窗口内 `chat_item_responses` 的数量（其 `time` 与 chatitem 创建时间一致），
仅用于进度估算：

```ts
MongoChatItemResponse.countDocuments({ time: { $gte: startDate, $lte: endDate } });
```

### 3.7 transformDocument

无需改动。仍使用 `responseData.id` 作为 `callId`，`chatItemDataId` 不暴露给下游。

## 4. 影响面

| 文件 | 改动 |
|---|---|
| `projects/admin/src/service/core/datacap/collect.ts` | 全部改动集中于此 |
| `storage.ts` / `validator.ts` / `taskExecutors.ts` | 无改动 |
| `projects/admin/src/types/datacap.d.ts` | 无改动 |

## 5. 验证方式

1. 在 Mongo 中直接执行新聚合（取一个小时间窗口），确认：
   - 返回条数 = `chat_item_responses` 中匹配 moduleType 的文档数；
   - `callId` 非空且唯一；
   - `modelId` 非 `unknown` 的比例符合预期；
   - `source` / `sourceName` 有值（验证集合名修复）。
2. 手工触发采集任务，检查日志：
   - `数据提取完成` 的 `totalRecords > 0`；
   - `Model 提取统计` 中 `unknown` 占比；
   - PostgreSQL `model_call_logs` 新增记录数、`duplicateCount = 0`。
3. 分别取**升级前时间窗口**（旧 `chatitems.responseData`）与**升级后时间窗口**验证兼容性。

## 6. 实施状态

已完成（2026-11-12）：

- `projects/admin/src/service/core/datacap/collect.ts` 已按上述方案修改；
- `tsc --noEmit` 中 `datacap/` 目录无类型错误；
- 使用 `mongodb-memory-server` 构造「新结构响应 + 旧结构响应 + 不可采集节点」数据执行聚合管道，
  结果为 `VERIFY_OK`：
  - 新结构 `chat_item_responses.data` 正常提取（`callId = r1`）；
  - 旧结构 `chatitems.responseData` 正常兼容（`callId = r3`）；
  - `datasetSearchNode` 响应被正确过滤；
  - `source` / `sourceName` 正确关联（集合名 `chats` 修复生效）；
  - model 兜底取到运行时版本节点（`runtime-model`，而非草稿 `draft-model`）。

### 6.1 修正：`find` 返回的 `_id` 是字符串

首次上线后出现「查询有数据但采集 0 条」。原因是 `packages/service/common/mongo/index.ts`
的 `addCommonMiddleware` 注册了 `schema.post(/^find/)`，会把返回文档的 `_id` 及所有 ObjectId
字段转成**字符串**（`lean()` 同样生效）。而聚合管道不会做类型转换：

```ts
const itemIds = batchItems.map((item) => item._id); // string[]
{ $match: { _id: { $in: itemIds } } }             // ObjectId vs string → 永远不匹配
```

修复方式：显式转回 ObjectId。

```ts
const itemIds = batchItems.map((item) => new Types.ObjectId(String(item._id)));
```

已用 mongoose + mongodb-memory-server 复现验证：`$in` 字符串返回 `[]`，`$in` ObjectId 返回 1 条。

> 注意：该中间件仅影响 `find` 系列（含 `lean`），`aggregate` 不经过它。凡是用 `find` 拿到
> `_id` 再回传给聚合/`$in`/`$lookup` 的地方都需要手动转回 ObjectId。
