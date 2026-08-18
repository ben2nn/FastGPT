# MongoDB 断连窗口期请求等待重连设计

> 日期: 2026-08-18
> 问题: 自动重连机制已验证生效,但断连→重连窗口期(约 1.2s)内的 API 请求全部 500
> 参考: 关联 [[mongo-keepalive-reconnect-fix]]

## 背景与现象

日志(2026-08-18 14:58:38):

```
mongo disconnected
[Warn] MongoDB 连接断开，启动自动重连
[Info] 等待 1000ms 后尝试重连 (1/5)          ← 窗口期开始
[Error] /api/core/dataset/collection/listV2, Client must be connected before running operations
[Error] /api/core/dataset/training/getDatasetTrainingQueue, ...  ← 4 个请求全部 500
[Error] /api/core/dataset/detail, ...
[Error] /api/core/dataset/list, ...
[Info] MongoDB 保活检查：外部重连进行中，跳过   ← 保活防竞争正确
[Info] 尝试重连 MongoDB (1/5)
[Info] MongoDB 重连成功                       ← 窗口期结束(约 1.2s)
[Info] Change Streams 建立成功
```

上次修复(监听器幂等、重连后重建 Change Streams、保活防竞争)全部按预期工作。
剩余问题:**窗口期内的请求立即失败**,用户在界面上看到 500,需要手动刷新。

## 根因分析

1. **Mongoose 6+ 断开后不再缓冲命令**:`bufferCommands: true` 只对初始连接生效;
   连接建立后再断开,操作立即抛 `MongoNotConnectedError`(driver 层错误,日志已证实)。
2. **admin 的重连是应用层行为**:断连 → 等待 1000ms → `connectMongo` → driver 建立连接,
   整个窗口约 1.2s,期间 `readyState === 0`,请求来一个死一个。
3. **App 项目无应用层重连**(参考对比):依赖 mongodb driver 原生自动恢复
   (unified topology 下瞬断通常不经历 `readyState=0`),不适用于 admin——admin 有
   保活主动断开(检测假死)、Change Streams 重建等 app 没有的能力,不应退化照抄。

## 修复方案

### 方案 1: 查询执行前等待连接就绪(治本)

在共享包 `packages/service/common/mongo/index.ts` 的 `addCommonMiddleware`
(已有 pre/post hook 挂载点,`getMongoModel` 创建的所有 model 均经过)中新增
pre hook:查询执行前若连接未就绪,等待连接恢复后继续执行。

**谁恢复连接不重要**:driver 原生自动恢复、admin 的自动重连、保活重连,
任何一方让 `readyState === 1` 且 ping 通过,等待即结束,查询继续。

```
断连(readyState=0)
  → 请求到达 → pre hook 检测未就绪 → 轮询等待(200ms 间隔,上限 5s)
  → admin 重连成功(readyState=1, ping OK)
  → 查询继续执行 → 请求成功
```

实现要点:

1. 共享层新增 `waitForMongoReady(timeoutMs?)`:
   - `readyState === 1` 直接返回 true(零开销快路径,每个查询多一次属性判断)
   - 否则轮询 200ms,`readyState === 1` 后还需 `db.admin().ping()` 通过才返回 true
     (防止 readyState 先于 driver 实际可用,与 admin 现有实现一致)
   - 超时返回 false
2. `addCommonMiddleware` 的 operations 数组(与慢查询日志同一组)每个操作挂
   `pre` hook,内部 `try/catch` 包裹等待逻辑,**任何情况下不阻断查询**;
   等待超时后放行,查询自然失败(与现状一致,只是延迟了等待时间)。

### 方案 2: 消除首次 1000ms 等待(缩短窗口)

`projects/admin/src/service/common/system/mongoWatch.ts` 的 `handleReconnect`:
断连事件已经发生,第一次重连前再等 1000ms 没有必要。改为首次立即重连,
后续重试保持指数退避(0ms → 2000ms → 4000ms → 8000ms → 16000ms)。
窗口从 ~1.2s 缩短到 ~0.3s。与方案 1 互补:方案 1 兜底,方案 2 减小窗口。

### 方案 3: 合并重复的 waitForMongoReady(顺带清理)

admin 项目 `projects/admin/src/service/common/mongo.ts` 已有同名实现
(10s 超时,供重连流程使用),与共享层新增函数逻辑重复。合并:删除 admin 本地实现,
统一使用共享层导出。共享层签名为 `waitForMongoReady(conn, timeoutMs?)`
(显式传 connection,避免共享层反向依赖),重连流程调用处传 `10000` 保持原超时,
查询 hook 用默认值(5s)。

## 关键设计决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 等待超时 | 5s(默认) | 瞬断场景 1s 内恢复,5s 覆盖 2~3 倍余量;真宕机时请求最多延迟 5s 后失败,避免挂起堆积 |
| 超时后行为 | 放行让查询自然失败 | 竞态窗口内连接可能刚好恢复;失败行为与现状一致,不引入新错误语义 |
| 挂载位置 | 共享层 addCommonMiddleware | app/admin 的 model 均经 getMongoModel 创建,一处挂载全部覆盖;app 同样受益 |
| 对 app 的影响 | 可接受 | readyState=1 时零开销;app 进入 readyState=0 本就彻底不可用,5s 后失败 vs 立即失败,仅延迟增加 |
| 快路径 | 只查 readyState,不 ping | 每查询 ping 开销不可接受;假死检测仍由保活定时器负责 |

## 测试设计

测试文件 `test/cases/service/mongo/queryWaitReconnect.test.ts`(需 `vi.unmock`
mongo 模块,参考 connectMongoListeners.test.ts):

1. `waitForMongoReady`:readyState=1 → 立即 true,不轮询
2. `waitForMongoReady`:readyState=0 → 400ms 后 spy 置 1 + mock ping → true,耗时≈400ms
3. `waitForMongoReady`:始终未就绪 → 超时返回 false(fake timers 加速)
4. hook 集成:真实 getMongoModel 建 model → readyState spy=0 → 发起 findOne →
   等待期恢复连接 → 断言查询经历了等待期后才放行
5. hook 快路径:readyState=1 → 无等待直接放行(断言耗时可忽略)

方案 2 改动单行,admin 项目无独立测试设施,通过 tsc + eslint 校验,手工验证断线场景。

### 测试结果(2026-08-18)

新增测试 `test/cases/service/mongo/queryWaitReconnect.test.ts`:5/5 通过,
关键用例验证断连窗口期发起的查询等待 500ms 重连成功后正常完成(而非立即抛
MongoNotConnectedError),健康路径查询 8ms 零开销。

回归:test/cases/service 下 mongo/dataset/support/core/common 共 578 个测试全部通过。

测试阶段发现并修正的问题:

1. **tinyspy 对 mongoose Connection.readyState getter 的 spy 会栈溢出**
   (`vi.spyOn(conn, 'readyState', 'get')` → tinyspy 包装函数自递归),
   且 spy 损坏后连锁导致后续所有测试失败。改用直接操作 mongoose 内部状态
   `(connection as any)._readyState` 模拟断连,afterEach 中恢复,绕开 getter spy。
2. **TS 对 getter 的类型收窄**:快路径 `readyState === 1` 检查后,循环内再比较
   报 TS2367(no overlap)。getter 运行时每次读取均为动态值,循环内断言为
   `(conn.readyState as number) === 1` 规避。

## 不改动项

- `bufferCommands`、连接池参数、保活间隔、重试次数等保持现状
- admin 重连流程本身的超时(10s)不变
- Change Streams 重建逻辑不变
