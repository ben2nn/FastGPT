# MongoDB 连接管理优化方案

## 最终方案：只依赖自动重连，不修改 entry.ts

### 核心思路

与 app 项目保持一致：
- entry.ts 不检查连接状态（`beforeCallback: []`）
- 完全依赖自动重连机制
- Change Streams 保持连接活跃

### 修改文件

#### 1. **entry.ts** - 与 app 项目一致
```typescript
import { NextEntry } from '@fastgpt/service/common/middle/entry';

export const NextAPI = NextEntry({ beforeCallback: [] });
```
- 不检查连接状态
- 无请求开销
- 与 app 项目保持一致

#### 2. **mongoWatch.ts** - 自动重连 + Change Streams
```typescript
// 监听连接断开事件，自动重连
connectionMongo.connection.on('disconnected', () => {
  setTimeout(async () => {
    if (connectionMongo.connection.readyState === 0) {
      await connectMongo({ db: connectionMongo, url: MONGO_URL });
      addLog.info('MongoDB 自动重连成功');
    }
  }, 1000);
});

// Change Streams 保持连接活跃
const changeStream = MongoSystemConfigs.watch();
```
- 监听 disconnected 事件
- 延迟 1 秒后自动重连
- Change Streams 保持连接活跃

#### 3. **mongo.ts** - 只负责连接
```typescript
export async function connectToMongo() {
  await connectMongo({ db: connectionMongo, url: MONGO_URL });
  addLog.info('MongoDB 连接已建立');
}
```
- 只负责初始连接
- 不管理重连逻辑

### 工作原理

```
启动流程：
connectToMongo() → 连接 MongoDB
      ↓
startMongoWatch() → 启动 Change Streams + 连接监控
      ↓
连接断开时：
disconnected 事件 → 延迟 1 秒 → 自动重连
      ↓
请求进入时：
直接执行（不检查连接状态）
      ↓
如果连接断开：
请求失败 → 自动重连 → 下次请求成功
```

### 与 app 项目的对比

| 方面 | app 项目 | admin 项目 |
|------|---------|-----------|
| entry.ts | `beforeCallback: []` | `beforeCallback: []` |
| 连接检查 | 无 | 无 |
| 自动重连 | Mongoose 内置 | mongoWatch.ts 实现 |
| Change Streams | 4 个 | 1 个（系统配置） |
| 连接保持 | Change Streams | Change Streams + 自动重连 |

### 优势

- ✅ **与 app 项目一致**：不修改 entry.ts
- ✅ **无请求开销**：不检查连接状态
- ✅ **自动重连**：连接断开后自动恢复
- ✅ **Change Streams**：保持连接活跃，实时响应配置变更
- ✅ **职责清晰**：mongoWatch.ts 统一管理连接

### 预期行为

**正常情况**：
- 请求直接执行，无额外开销

**连接断开时**：
1. 请求失败（`MongoNotConnectedError`）
2. 自动重连启动
3. 下次请求成功

**这是可接受的行为**，因为：
- 连接断开是罕见情况
- 自动重连会在 1 秒内完成
- 用户只需刷新页面即可

### 预期日志

启动时：
```
MongoDB 连接已建立
启动 MongoDB Change Streams 监听
MongoDB 连接监控已启用
```

连接断开时：
```
MongoDB 连接断开，启动自动重连
MongoDB 自动重连成功
```
