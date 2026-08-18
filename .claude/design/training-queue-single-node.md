# 训练队列单节点执行设计(app 禁用训练队列)

> 日期: 2026-08-18
> 问题: app 和 admin 双进程共享同一 Mongo 训练队列,app 的 rebuildData 缺少
> `filter(Boolean)` 修复,处理导入重建任务时 delete 报 `column "undefined" does not exist`
> 关联: [[mongo-keepalive-reconnect-fix]] [[mongo-query-wait-reconnect]]

## 背景与根因

### 证据链

1. importFromJson(16:01)导入数据并清除 `indexes[].dataId`,创建 630 个 mode=chunk
   重建任务(账单 appName = "导入后重建索引")
2. **app 进程的官方队列抢到任务**(admin 15:42 才启动,app 的 worker 更早/并行运行)
3. app 版 [generateVector.ts:174](projects/app/src/service/core/dataset/queues/generateVector.ts#L174)
   的 rebuildData **没有 `filter(Boolean)`**(admin 版在 10:41 commit 1a0405b92 已修复):
   ```ts
   const deleteVectorIdList = trainingData.data.indexes.map((index) => index.dataId);
   // = [undefined, undefined, undefined](dataId 已被导入流程 $unset 清除)
   ```
4. `deleteDatasetDataVector({ idList: [undefined,...] })` → PgVectorCtrl.delete 拼 SQL:
   ```sql
   DELETE FROM modeldata WHERE team_id='...' AND id IN (undefined,undefined,undefined)
   ```
   `String(undefined)` 得到 JS 字符串 "undefined",拼入 SQL 时**没有引号** →
   PG 解析为列名 → **`column "undefined" does not exist`**(42703)
5. delete 在 mongoSessionRun 事务内 → 事务 abort → errorMsg 写入 → 界面"训练异常"

### 旁证(PG 序列)

`modeldata_id_seq` 当前值 764079,表最大 id 746415 —— 17664 个 id 被 insert 消耗
但行已不存在,证明双进程反复处理(insert 成功 + 后续清理),队列竞争造成大量无效写入。

### 双进程队列冲突的本质

app 与 admin 共享同一 `dataset_trainings` 集合:
- 双方都有轮询队列(app: `startTrainingQueue`;admin: `startAdminTrainingQueue` + 每分钟 cron)
- 双方都有 Change Stream watch(app: `createDatasetTrainingMongoWatch`;admin: `createAdminTrainingMongoWatch`)
- 同一个任务可能被双方重复拾取(3 分钟 lockTime 冷却后另一方可抢),重复 embedding、
  重复插入向量,且 app 的缺陷版本会污染错误状态

## 修复方案

### 方案 1: app 训练队列禁用开关(主修复)

app 检测环境变量 `DISABLE_TRAINING_QUEUE=1` 时,不启动任何训练队列消费:
- 轮询入口跳过、Change Stream watch 不建立

改动点(均在 projects/app):

1. `src/service/core/dataset/training/utils.ts`:
   - `startTrainingQueue`:开头检测开关,启用时直接 return
   - `createDatasetTrainingMongoWatch`:开头检测开关,启用时返回 null(不建立 watch)
2. `src/service/common/system/volumnMongoWatch.ts`:startMongoWatch 中条件 push
   training watch(其余 watch:系统配置热更新、模板、模型更新**保留**)
3. `src/instrumentation.ts`:startTrainingQueue(true) 条件调用
4. `.env.template` 增加变量注释说明

app 进程配置 `DISABLE_TRAINING_QUEUE=1` 后:
- 训练任务全部由 admin 消费(启动时队列 + watch + 每分钟 cron 兜底)
- app 保留:系统配置热更新 watch、模板 watch、模型 watch、工作流 bullmq(与训练无关)

### 方案 2: app 版 rebuildData 补 filter 修复(防御)

`projects/app/src/service/core/dataset/queues/generateVector.ts:174` 同步 admin 的修复:

```ts
const deleteVectorIdList = trainingData.data.indexes
  .map((index) => index.dataId)
  .filter(Boolean) as string[];
```

即使开关被误关(app 单独部署时),也不会再产生 `column "undefined"` 错误
(空 idList 时 PgVectorCtrl.delete 直接 return)。

### 方案 3(可选,不做): Mongo 分布式锁

为队列加租约锁可让双进程自动互斥,但实现复杂且不符合"固定由 admin 执行"的
运维预期,本设计不采用。

## 影响面

| 项目 | 影响 |
|---|---|
| admin | 无改动,队列行为不变 |
| app | 设开关后不消费训练任务;不设开关时行为与现状一致(但带防御修复) |
| 共享包 | 无改动 |
| 数据 | 无迁移;既有 630 条失败训练记录(errorMsg)保留,可手动删除或重新训练 |

## 验证

1. tsc + eslint(两项目)
2. 测试:修复后重启 app(带 `DISABLE_TRAINING_QUEUE=1`),确认启动日志无队列消费;
   创建训练任务,确认仅 admin 的 `[Vector Queue]` 日志在消费
3. 回归:admin 队列正常处理训练任务(观察 PG modeldata 新行 + errorMsg 不再新增)
