# insertData / update 接口联动增量增强索引 设计

## 1. 背景与目标

现有「索引增强」（Q-A-Index 三字段结构，见 [index-enhance-design.md](index-enhance-design.md)）只支持**批量**触发：在数据集详情页选择集合后调用 `enhanceIndexes` API，将全部数据推入训练队列。

问题：管理员通过 `insertData`（手动输入/标注数据）或 `update` 接口新增、修改单条数据后，该条数据**不会自动**经历索引增强，与批量增强过的数据在检索质量上不一致。

**目标**：insert / update 单条数据成功后，自动将该条数据推入 enhance 训练队列（增量，只增强这一条），异步完成 Q-A-Index 增强，无需前端改动。

## 2. 已确认的产品决策

| 决策点 | 结论 |
|--------|------|
| 触发方式 | **总是自动增强**，接口不新增参数，前端不改 |
| 计费 | **不创建 training 账单**；队列处理时 `checkTeamAiPointsAndLock` 的余额检查仍生效 |
| 联动范围 | insertData 与 update 两个接口都联动 |

## 3. 现有链路（复用，无需改动）

```
enhanceIndexes(批量) ──► MongoDatasetTraining(mode=enhance, dataId, lockTime=2999/5/5)
                              │
   admin mongoWatch insert 事件 ─┼──► generateEnhanceIndex() 队列处理器
   startAdminTrainingQueue 轮询 ─┘        │
                                          ├─ 按 dataId 读取 MongoDatasetData 最新内容
                                          ├─ LLM 生成新 q + indexes
                                          ├─ 插入新向量 → 更新 MongoDatasetData(q/a/indexes)
                                          └─ 删除旧向量 → 删除训练任务
```

关键点（已核实）：

- admin 专属任务标记：`lockTime = ADMIN_ONLY_LOCK_TIME(2999/5/5)` + `expireAt = getAdminOnlyInitialExpireAt()`（过去时间，创建后立即可拾取），见 [training/constants.ts](../../projects/admin/src/service/core/dataset/training/constants.ts)
- 队列拾取条件（admin）：`lockTime >= 2099/1/1 且 expireAt <= now-10min`（enhance 任务 coolMinutes=10），见 [queuePick.ts](../../projects/admin/src/service/core/dataset/training/queuePick.ts)
- `generateEnhanceIndex` 处理时**实时读取** `MongoDatasetData` 的内容（非训练任务里的快照），训练任务里的 q 仅做非空校验
- watch 与轮询双通道均在 admin 应用中已启用（[mongoWatch.ts](../../projects/admin/src/service/common/system/mongoWatch.ts)、[instrumentation.ts](../../projects/admin/src/instrumentation.ts)）

## 4. 设计方案

### 4.1 新增公共函数 `pushEnhanceTaskForData`

位置：`projects/admin/src/service/core/dataset/training/pushEnhanceTask.ts`

```ts
export async function pushEnhanceTaskForData({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  dataId,
  q,
  a,
  chunkIndex,
  indexes
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  dataId: string;       // MongoDatasetData._id
  q: string;
  a?: string;
  chunkIndex?: number;
  indexes?: { type: DatasetDataIndexTypeEnum; text: string; dataId?: string }[];
}): Promise<boolean> // true=已入队, false=跳过
```

逻辑（与批量 `enhanceIndexes` 保持一致）：

0. **空 q 跳过**：`!q?.trim()` → 返回 false（队列处理器对空 q 任务会直接删除，不入队更干净）
1. **超长切片跳过**：`q.length > 8000`（与批量 `chunkLimit` 默认值一致）→ 返回 false，不入队
2. **去重**：查询 `MongoDatasetTraining.findOne({ dataId, mode: TrainingModeEnum.enhance, retryCount: { $gt: 0 } })`，存在待处理任务 → 返回 false，避免重复 LLM 调用与重复计费
3. **索引过滤**：清除 `summary` / `question` 类型索引（与批量逻辑一致）
4. **入队**：`MongoDatasetTraining.create({ ... 快照字段, mode: enhance, dataId, billId: undefined, retryCount: 50, lockTime: ADMIN_ONLY_LOCK_TIME, expireAt: getAdminOnlyInitialExpireAt() })`
5. 返回 true；addLog 记录入队/跳过原因

实现约束：仅使用 `@fastgpt/*` 与相对路径 import（不用 `@/` admin 别名），保证根目录 vitest（`@` 指向 app）可直接单测该文件。

### 4.2 insertData 接口联动

文件：`projects/admin/src/pages/api/core/dataset/data/insertData.ts`

在 `insertData2Dataset` 成功后（`pushGenerateVectorUsage` 之后）追加：

```ts
await pushEnhanceTaskForData({
  teamId, tmbId, datasetId, collectionId,
  dataId: String(insertId),
  q: formatQ, a: formatA, chunkIndex: 0,
  indexes: formatIndexes
});
```

- **返回值不变**（仍返回 `insertId`），前端 [InputDataModal.tsx](../../projects/admin/src/pageComponents/dataset/detail/InputDataModal.tsx) 零改动
- 入队失败不影响插入结果（接口已成功返回，增强是尽力而为的后台任务；异常时 catch + addLog.error，不向上抛）

### 4.3 update 接口联动

文件：`projects/admin/src/pages/api/core/dataset/data/update.ts`

在 `updateData2Dataset` 成功后的 `if (q || a || indexes.length > 0)` 分支内追加：

```ts
await pushEnhanceTaskForData({
  teamId, tmbId,
  datasetId: String(collection.datasetId),
  collectionId: String(collection._id),
  dataId,
  q, a, chunkIndex: 0, indexes
});
```

- `authDatasetData` 返回的 collection 已带 datasetId 与 _id，无需额外查询
- 同样 catch 异常不阻断更新流程

### 4.4 计费说明

按决策不创建账单（`billId` 留空）：

- `generateEnhanceIndex` 内的 `checkTeamAiPointsAndLock` 仍然生效：团队 AI 点数不足时任务被跳过并继续留在队列（与批量增强行为一致）
- 增强产生的 LLM/向量消耗不计入 usage 账单（与用户确认的决策一致；后续如需计费，只需在 `pushEnhanceTaskForData` 中调用 `createTrainingUsage` 并绑定 `billId`，改动收敛在这一处）

### 4.5 边界与竞态说明

- **超长切片**：q 超过 8000 字符不增强（LLM 处理失败率高，与批量一致）
- **重复入队**：同 dataId 已有 pending enhance 任务时跳过；update 连续多次保存只产生一条任务（第一条完成后可再次入队）
- **处理竞态**：队列处理器实时读取数据内容，若处理期间用户又 update 了该条数据，增强结果可能覆盖较新的编辑——这是批量增强已存在的固有行为，本次不额外处理
- **image 类型集合**：q 为图片描述文本，增强同样适用，不特殊排除

## 5. 测试计划（Vitest）

新增 `test/cases/service/dataset/pushEnhanceTask.test.ts`，参考 [adminOnlyTrainingQueue.test.ts](../../test/cases/service/dataset/adminOnlyTrainingQueue.test.ts) 的 mock 模式（mock `@fastgpt/service/core/ai/model`）。

| # | 用例 | 断言 |
|---|------|------|
| 1 | 正常入队 | 任务存在：mode=enhance、dataId 正确、lockTime=2999/5/5、expireAt<=now-3min、retryCount=50、无 billId、快照 q/a/chunkIndex 正确 |
| 2 | 空 q 跳过 | q 为空白 → 不入队，返回 false |
| 3 | 超长切片跳过 | q.length>8000 → 不入队，返回 false |
| 4 | 去重 | 同 dataId 已有 pending enhance 任务 → 不入队，返回 false，任务总数不变 |
| 5 | 完成后可再入队 | 既有任务 retryCount=0 → 可再次入队 |
| 6 | 索引过滤 | 入队任务 indexes 中不含 summary/question 类型，保留 default/custom |

## 7. 实施状态

✅ 已完成并验证（2026-08-19）：

- [pushEnhanceTask.ts](../../projects/admin/src/service/core/dataset/training/pushEnhanceTask.ts) 已实现
- [insertData.ts](../../projects/admin/src/pages/api/core/dataset/data/insertData.ts)、[update.ts](../../projects/admin/src/pages/api/core/dataset/data/update.ts) 已联动
- 测试 [pushEnhanceTask.test.ts](../../test/cases/service/dataset/pushEnhanceTask.test.ts)：6 用例全通过；既有 adminOnlyTrainingQueue 测试无回归
- tsc：3 个改动文件无新增类型错误（项目存在历史遗留错误，与本次无关）
- eslint：4 个文件（3 实现 + 1 测试）无告警

## 6. 涉及文件清单

| 文件 | 改动 |
|------|------|
| `projects/admin/src/service/core/dataset/training/pushEnhanceTask.ts` | **新增**公共函数 |
| `projects/admin/src/pages/api/core/dataset/data/insertData.ts` | 插入成功后调用 |
| `projects/admin/src/pages/api/core/dataset/data/update.ts` | 更新成功后调用 |
| `test/cases/service/dataset/pushEnhanceTask.test.ts` | **新增**单测 |

前端、队列处理器、watch、instrumentation 均**零改动**。
