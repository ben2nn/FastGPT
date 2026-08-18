# 训练队列任务隔离设计(admin 导入任务仅 admin 消费,不修改 app)

> 日期: 2026-08-18
> 问题: app 与 admin 双进程共享 Mongo 训练队列,app 的 rebuildData 缺少 filter(Boolean)
> 修复,消费 admin 导入的重建任务时 delete 报 `column "undefined" does not exist`
> 约束: 不能修改 projects/app 代码
> 关联: [[training-queue-single-node]](旧方案,被本方案取代) [[mongo-keepalive-reconnect-fix]]

## 背景与根因

1. importFromJson 导入数据并 `$unset` 清除 `indexes[].dataId`,创建 mode=chunk 重建任务
2. app 的官方队列(app 版 rebuildData 无 `filter(Boolean)`)抢到任务:
   `deleteVectorIdList = [undefined × N]` → `DELETE ... id IN (undefined,...)`
   (JS `String(undefined)` 拼入 SQL 无引号)→ PG 报 `column "undefined" does not exist`
3. 630 个任务 100% 失败(errorMsg 相同),PG 序列消耗 17664 个 id(insert 成功行被后续清理),
   证明双进程重复消费

## 方案: lockTime 远期值标记专属任务(零 app 改动)

### 原理

app 队列查询条件固定为 `lockTime: { $lte: now - 3min }`(无法修改 app 代码)。
将 admin 创建的任务 `lockTime` 设为远期时间(**2999/5/5**,与既有
`lockTrainingDataByTeamId` 的魔法值一致),则 app 的 watch/轮询永远匹配不到,
自然跳过;admin 自己的队列查询放宽,仍可拾取。

两个互斥维度分别用两个既有字段承担:

| 字段 | 作用 | 专属任务用法 |
|---|---|---|
| `lockTime` | 屏蔽 app(不可改 app 查询) | 固定 2999/5/5,拾取时**不动** |
| `expireAt` | admin 内部 3 分钟冷却(替代 lockTime 的互斥职责) | 拾取时更新为 now,3 分钟后 admin 可重试 |

TTL 兜底:专属任务若无人消费(admin 挂掉),expireAt 停在创建时间,7 天后
被既有 TTL 索引自动清理,不会永久堆积。

### 改动清单

**1. 共享包(一行,向后兼容)**

`packages/service/core/dataset/training/controller.ts`:
`pushDataListToTrainingQueue` 加可选参数 `lockTime?: Date`,insertMany 时
`...(lockTime && { lockTime })`。app 调用方不传,行为不变。

**2. admin 常量**

`projects/admin/src/service/core/dataset/training/utils.ts`:
```ts
export const ADMIN_ONLY_LOCK_TIME = new Date('2999/5/5');      // 专属任务 lockTime
export const ADMIN_ONLY_LOCK_THRESHOLD = new Date('2099/1/1'); // 专属判定阈值
```

**3. admin 创建训练任务处统一打标(lockTime = ADMIN_ONLY_LOCK_TIME)**

- importFromJson.ts(核心,insertMany 的 map 加 lockTime)
- rebuildEmbedding.ts(MongoDatasetTraining.create 加 lockTime)
- adminCreateCollection.ts(pushDataListToTrainingQueue 传 lockTime;:334 create 加 lockTime)
- generateQA.ts / datasetParse.ts / generateAutoIndex.ts / generateImageIndex.ts
  (pushDataListToTrainingQueue 调用传 lockTime)
- generateVector.ts(rebuildData 中 newRebuildingData 的 create 加 lockTime)
- enhanceIndexes.ts(enhance 任务统一打标,app 目前不消费 enhance,防御将来)

**4. admin 队列查询改造(6 个队列,两次原子拾取)**

各队列循环内先查普通任务(现有条件,保持与 app 任务兼容),未命中再查专属任务:

```ts
// 1. 普通任务(含 app 创建,行为不变)
const normal = await MongoDatasetTraining.findOneAndUpdate(
  { mode, retryCount: { $gt: 0 }, lockTime: { $lte: addMinutes(new Date(), -3) } },
  { lockTime: new Date(), $inc: { retryCount: -1 } }
).populate(...).lean();
if (normal) return { data: normal };

// 2. admin 专属任务(lockTime 远期,app 查询不可见)
return MongoDatasetTraining.findOneAndUpdate(
  {
    mode,
    retryCount: { $gt: 0 },
    lockTime: { $gte: ADMIN_ONLY_LOCK_THRESHOLD },
    expireAt: { $lte: addMinutes(new Date(), -3) }
  },
  { expireAt: new Date(), $inc: { retryCount: -1 } }   // 不动 lockTime
).populate(...).lean();
```

- 失败路径**无需改动**:expireAt 已是拾取时间,3 分钟后 admin 自然重试;
  lockTime 保持 2999,app 始终不可见;retryCount 耗尽后定型,与现有语义一致
- 成功路径任务删除,与现状一致

### 不改动

- projects/app 全部代码(零改动)
- schema(不加字段,复用 lockTime/expireAt)
- 失败重试语义(3 分钟冷却、retryCount 5 次)
- app 任务的消费路径(admin 仍会处理 app 创建的无标任务,与现状一致;
  admin 代码含 filter 修复,处理安全)

## 测试设计

`test/cases/service/dataset/adminOnlyTrainingQueue.test.ts`(共享包可测部分):

1. 专属任务查询语义:
   - 创建 lockTime=2999/5/5、expireAt=now-4min 的任务
   - app 语义查询(lockTime <= now-3min)查不到 → 证明 app 会跳过
   - admin 语义查询(lockTime >= 2099 且 expireAt <= now-3min)查到 → 证明 admin 可拾取
2. 专属任务互斥:拾取(expireAt=now)后立即再查(admin 语义)查不到;
   推进 3 分钟后重新可查 → 冷却语义
3. `pushDataListToTrainingQueue` 传 `lockTime` 后任务携带该值;不传时行为不变

## 验证步骤(手工)

1. admin 重启后导入 JSON(rebuildIndex=true)→ 查任务 lockTime = 2999/5/5
2. 观察 app 日志:无 [Vector Queue] Start(不消费)
3. 观察 admin 日志:正常消费、PG modeldata 新增行、无新 errorMsg

### 测试结果(2026-08-18)

新增测试 `test/cases/service/dataset/adminOnlyTrainingQueue.test.ts`:6/6 通过,
覆盖专属任务对 app/admin 查询语义的可见性差异、expireAt 冷却、普通任务兼容、
pushDataListToTrainingQueue 的 lockTime 参数传递与向后兼容。

回归:test/cases/service 下 mongo/dataset/core/common/support 共 575 个测试全部通过。
tsc:本次改动文件无新增类型错误(adminCreateCollection 等文件的报错为既有问题)。
eslint:无问题。

### 实施说明

1. 常量独立存放于 `training/constants.ts`(避免 training/utils.ts 与队列模块循环依赖)
2. 队列拾取辅助独立存放于 `training/queuePick.ts`,两次原子查询:
   普通任务优先(兼容 app 创建的任务),专属任务兜底
3. 冷却时间参数化:vector 队列 3 分钟,qa/parse/auto/image/enhance 队列 10 分钟,
   与各队列原有 lockTime 冷却保持一致
4. **修正(首日联调)**:专属任务初始 expireAt 必须为过去时间
   (`getAdminOnlyInitialExpireAt()`,now-10min),否则任务创建后要白等一轮冷却
   才能被拾取(原方案用 lockTime 默认 2000/1/1 天然立即可拾取,换用 expireAt
   承担互斥后丢失了这一点)。共享函数 pushDataListToTrainingQueue 传 lockTime 时
   自动附带过去时间的 expireAt,手动 create/insertMany 的入口显式传入。
   对 7 天 TTL 的影响:仅提前 10 分钟,可忽略。
