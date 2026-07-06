# MongoDB Change Streams 移植完成

## 改动总结

### 1. 新增文件

#### [projects/admin/src/service/common/system/mongoWatch.ts](projects/admin/src/service/common/system/mongoWatch.ts)
- 移植了 app 项目的 `volumnMongoWatch.ts` 功能
- 监听系统配置变更（`MongoSystemConfigs`）
- **监听所有配置类型**：fastgpt, fastgptPro, systemMsgModal, license, operationalAd, activityAd
- 使用 Change Streams 保持 MongoDB 连接活跃

### 2. 修改文件

#### [projects/admin/src/instrumentation.ts](projects/admin/src/instrumentation.ts)
- 导入 `startMongoWatch` 函数
- 在 MongoDB 连接成功后启动 Change Streams 监听

#### [projects/admin/src/service/common/mongo.ts](projects/admin/src/service/common/mongo.ts)
- 移除了保活机制（`startKeepAlive`、`stopKeepAlive`、`markMongoActivity`）
- 简化为只负责连接 MongoDB

#### [projects/admin/src/service/middleware/entry.ts](projects/admin/src/service/middleware/entry.ts)
- 移除了 `markMongoActivity` 中间件调用
- 恢复为简单的中间件配置

### 3. PostgreSQL 保活机制

**保留不变**：PostgreSQL 仍使用保活机制，因为：
- PostgreSQL 没有类似 MongoDB Change Streams 的机制
- 连接池需要保活机制防止连接断开
- 每 60 秒发送 `SELECT 1` 查询

## 工作原理

### MongoDB 连接保持机制

```
启动流程：
connectToMongo() → 连接 MongoDB
      ↓
startMongoWatch() → 启动 Change Streams
      ↓
监听系统配置变更 → 保持连接活跃
```

### 为什么 Change Streams 能保持连接？

1. **长连接**：Change Streams 维护持续的数据库连接
2. **心跳机制**：MongoDB 客户端定期发送心跳
3. **不会空闲**：因为有活跃的监听器，连接不会被标记为空闲
4. **自动重连**：如果连接断开，Change Streams 会自动重连

## 对比

### 之前（保活机制）
```
每 60 秒发送 ping 命令
↓
需要额外的定时器
↓
需要标记活动状态
↓
5 分钟无活动后停止
```

### 现在（Change Streams）
```
启动时创建 Change Stream
↓
监听系统配置变更
↓
连接始终保持活跃
↓
自动重连机制
```

## 优势

- ✅ **与 app 项目一致**：使用相同的连接保持机制
- ✅ **更优雅**：利用 MongoDB 原生功能
- ✅ **更可靠**：Change Streams 有内置的重连机制
- ✅ **更简单**：移除了复杂的保活逻辑
- ✅ **功能增强**：实时监听系统配置变更

## 验证方法

重启 admin 项目后，观察日志：

1. 启动时：
   ```
   MongoDB 连接已建立
   启动 MongoDB Change Streams 监听
   ```

2. 修改系统配置时：
   ```
   系统配置已更新并重新加载
   ```

3. 连接状态：
   - 不再出现 "MongoDB 连接断开" 的警告
   - 不再出现 "MongoNotConnectedError" 错误
