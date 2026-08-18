# MongoDB 保活与重连机制修复设计

> 日期: 2026-08-18
> 问题: admin 项目断线后仍出现裸 `mongo disconnected`,自动重连机制在一次重连后失效

## 背景与现象

日志(2026-08-18 11:24:19):

```
[Warn] MongoDB 连接断开，启动自动重连
[Info] 等待 1000ms 后尝试重连 (1/5)
[Info] MongoDB 保活检查：外部重连进行中，跳过
[Info] 尝试重连 MongoDB (1/5)
MongoDB start connect
mongo connected                              ← connected 监听器 #1(启动时残留)
[Info] MongoDB 连接已建立
mongo connected                              ← connected 监听器 #2(本次重连注册)
[Info] MongoDB 重连成功
[Info] Change Streams 建立成功
```

首次断线重连正常,但两个 `mongo connected` 暴露监听器累积;更严重的是
`connectMongo` 的 `removeAllListeners` 会误删自动重连监听器。

## 根因分析

### 断线根因(无法根治,只能快速恢复)

- `socketTimeoutMS: 60000`(60s 空闲关 socket)+ `heartbeatFrequencyMS: 5000`(5s 心跳)
- 跨公网/NAT/防火墙部署时网络设备切断空闲 TCP,瞬断不可避免
- 日志显示 1 秒即恢复 → 网络瞬断,非 MongoDB 宕机

### 恢复机制缺陷(必须修复)

1. **致命: 重连后自动重连监听器被误删**
   - `packages/service/common/mongo/init.ts` 的 `RemoveListeners` 使用
     `removeAllListeners('error'/'disconnected')`,连带移除
     `mongoWatch.ts#setupConnectionMonitor` 注册的 `disconnected → handleReconnect`
   - 后果: 第一次重连后,后续断开只打印 `console.error('mongo disconnected')`,
     不再自动重连,只能靠 30s 保活兜底;保活重连同样调 `connectMongo`,问题循环

2. **connected 监听器累积**
   - `RemoveListeners` 不清 `'connected'`,每次 `connectMongo` 注册一个,日志中
     出现多个 `mongo connected`

3. **驱动自动恢复时不重建 Change Streams**
   - `handleReconnect` 中 `readyState === 1` 直接 return,不 `cleanupMongoWatch` +
     `setupChangeStreams`
   - 断线导致游标失效后: 系统配置热更新、training 变更监听永久丢失;
     stream error → `handleChangeStreamError` → `handleReconnect` → 又 return,死循环

4. **保活检查不 ping**(次要)
   - 只查 `readyState`,TCP 假死(readyState 仍 1 但不可用)检测不到

## 修复方案

### 修复 1: init.ts 监听器幂等注册(根治 Bug 1/2)

`packages/service/common/mongo/init.ts`:

- 具名监听器 + `removeListener` 幂等注册,替代 `removeAllListeners`
- 不再误删外部监听器(admin 的自动重连、app 的 watch 等)
- 自身监听器不累积

```ts
const onError = (error: any) => console.error('mongo error', error);
const onConnected = () => console.log('mongo connected');
const onDisconnected = () => console.error('mongo disconnected');

const RemoveListeners = () => {
  db.connection.removeListener('error', onError);
  db.connection.removeListener('disconnected', onDisconnected);
  db.connection.removeListener('connected', onConnected);
};
// 注册前先移除自身旧监听器(幂等)
RemoveListeners();
db.connection.on('error', onError);
db.connection.on('connected', onConnected);
db.connection.on('disconnected', onDisconnected);
```

影响面: connectMongo 被 app / marketplace / test 共用。它们均未依赖
`removeAllListeners` 的清除行为,改为幂等注册对它们无害(同样修复潜在误删)。

### 修复 2: mongoWatch.ts 重连逻辑完善(Bug 3)

`handleReconnect` 的 `readyState === 1` 分支改为重建 Change Streams:

```ts
if (connectionMongo.connection.readyState === 1) {
  addLog.info('MongoDB 已重新连接，重建 Change Streams');
  cleanupMongoWatch();
  await setupChangeStreams();
  isReconnecting = false;
  setExternalReconnecting(false);
  return;
}
```

### 修复 3: setupConnectionMonitor 幂等化(防御)

- 监听器改为具名函数,重复调用时先 `removeListener` 再 `on`
- `handleReconnect` 成功路径与保活重连成功路径中,重新调用
  `setupConnectionMonitor()` 兜底(防止任何路径下监听器丢失)

### 修复 4: 保活检查加 ping(可选增强)

保活定时器每次检查时执行 `db.admin().ping()`:
- ping 失败 → 主动 `disconnect()` 后走重连流程(覆盖假死场景)
- `_externalReconnecting` 时跳过,保持防竞争逻辑

## 测试验证

1. 单元/集成: 模拟 `disconnected` 事件 → 触发 `handleReconnect` → 重连成功 →
   再次触发 `disconnected` → 验证第二次仍自动重连(当前代码会失败)
2. 监听器计数: 重连 3 次后 `connection.listenerCount('connected')` 不增长
3. 手动断网/恢复 MongoDB: 验证 Change Streams 重建、系统配置热更新恢复
4. 回归: `pnpm test`(app 共用 init.ts)

### 测试结果(2026-08-18)

新增回归测试 `test/cases/service/mongo/connectMongoListeners.test.ts`:

- 修复代码: 2/2 通过
- 还原旧代码(removeAllListeners)反向验证: 2/2 失败,证明测试能捕获原始缺陷

测试阶段发现并修正的问题:

1. **test/mocks/common/mongo.ts 会将 connectMongo 整体 mock 掉**,导致测试测不到
   真实代码。测试文件需 `vi.unmock('@fastgpt/service/common/mongo/init')`。
2. **监听器函数必须模块级共享引用**: 若定义在 connectMongo 函数体内,每次调用
   都是新引用,`removeListener` 无法匹配上一次注册的函数,幂等失效
   (测试曾捕获 `expected 4 to be 1` 的累积)。

admin 的 mongoWatch.ts / mongo.ts 无独立测试设施(root vitest 的 `@` 别名指向
app),逻辑修复通过 ESLint + tsc 校验,建议在环境手工验证断线场景。

## 不改动项

- `socketTimeoutMS` / `heartbeatFrequencyMS` 等连接参数保持官方默认
- 30s 保活间隔、5 次重试、指数退避策略不变
