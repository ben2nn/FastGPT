# PostgreSQL 初始化说明

## 任务配置初始化逻辑

### 设计目标

确保 `task_configs` 表中的初始配置只在数据库表结构第一次创建时加载，避免每次应用启动都重复加载配置。

### 实现方式

1. **表存在性检查**
   - 在创建 `task_configs` 表之前，先检查表是否已存在
   - 使用 PostgreSQL 的 `information_schema.tables` 查询表信息

2. **条件加载**
   - 如果表不存在（首次创建）：创建表后立即加载 `taskConfigs.ts` 中的初始配置
   - 如果表已存在（后续启动）：跳过配置加载，保留数据库中的现有配置

3. **配置同步**
   - 使用 `ON CONFLICT (id) DO NOTHING` 确保不会覆盖已存在的配置
   - 保留用户在数据库中修改的配置（如 `enabled` 状态）

### 代码流程

```typescript
// 1. 检查表是否存在
const tableExistsResult = await client.query(`
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'task_configs'
  )
`);

const taskConfigsTableExists = tableExistsResult.rows[0].exists;

// 2. 从 SQL 文件加载并执行所有表结构语句
const sqlStatements = getSchemaStatements();
for (const statement of sqlStatements) {
  await client.query(statement);
}

// 3. 只在首次创建时加载配置
if (!taskConfigsTableExists) {
  await loadInitialTaskConfigs(client);
}
```

### 日志输出

#### 首次启动（表不存在）
```
[INFO] 开始创建数据库表...
[INFO] 表 task_configs 创建成功
[INFO] 任务配置表索引创建成功
[INFO] 检测到 task_configs 表首次创建，开始加载初始配置...
[INFO] 准备加载 3 个初始任务配置...
[INFO] 初始任务配置已加载: data-process - 数据处理任务
[INFO] 初始任务配置已加载: data-cleanup - 数据清理任务
[INFO] 初始任务配置已加载: report-generation - 报告生成任务
[INFO] 初始任务配置加载完成，共 3 个任务
```

#### 后续启动（表已存在）
```
[INFO] 开始创建数据库表...
[INFO] 表 task_configs 创建成功
[INFO] 任务配置表索引创建成功
[INFO] task_configs 表已存在，跳过初始配置加载
```

### 优势

1. **性能优化**：避免每次启动都执行不必要的数据库写入操作
2. **配置保留**：保留用户在运行时修改的配置（如启用/禁用任务）
3. **幂等性**：多次执行初始化不会产生副作用
4. **清晰日志**：通过日志明确显示是否加载了初始配置

### 注意事项

1. **配置更新**
   - 如果需要更新任务配置，应该通过 API 或管理界面修改数据库
   - 不要依赖重启应用来更新配置

2. **新增任务**
   - 如果在 `taskConfigs.ts` 中新增任务，需要手动同步到数据库
   - 或者使用专门的配置同步 API

3. **配置迁移**
   - 如果需要重置所有配置，可以删除 `task_configs` 表后重启应用
   - 或者使用数据库迁移脚本

### SQL 文件管理

所有数据库表结构定义都存储在独立的 SQL 文件中：

- `projects/admin/src/service/sql/schema.sql` - 数据库表结构定义
- `projects/admin/src/service/sql/index.ts` - SQL 脚本加载模块
- `projects/admin/src/service/sql/README.md` - SQL 文件管理文档

**优势**：
1. SQL 语句与业务代码分离，便于维护
2. 可以直接使用 psql 等工具执行 SQL 文件
3. 便于数据库管理员审查和优化
4. 支持版本控制和变更追踪

### 相关文件

- `projects/admin/src/service/common/postgres.ts` - 数据库初始化逻辑
- `projects/admin/src/service/sql/` - SQL 脚本管理目录
- `projects/admin/src/service/core/task/taskConfigs.ts` - 任务配置定义
- `projects/admin/src/service/core/task/TaskStorage.ts` - 任务存储层
