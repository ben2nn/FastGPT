# SQL 脚本管理

## 目录结构

```
sql/
├── README.md          # 本文档
├── schema.sql         # 数据库表结构定义
└── index.ts           # SQL 脚本加载和管理模块
```

## 文件说明

### schema.sql

包含所有数据库表结构的 SQL 定义，包括：

1. **model_call_logs** - 模型调用日志表
   - 存储 AI 模型调用的详细记录
   - 包含 token 使用量、费用等信息
   - 支持按时间、应用、模型等维度查询

2. **task_configs** - 任务配置表
   - 存储定时任务的配置信息
   - 包含 cron 表达式、执行器名称、参数等
   - 支持启用/禁用任务

3. **task_executions** - 任务执行历史表
   - 记录每次任务执行的详细信息
   - 包含执行状态、结果、错误信息等
   - 支持按任务、状态、时间查询

### index.ts

提供 SQL 脚本的加载和管理功能：

- `getSchemaStatements()` - 获取所有 SQL 语句数组
- `getSchemaSql()` - 获取完整的 SQL 文本
- `getCategorizedStatements()` - 获取分类后的 SQL 语句（表、索引）

## 使用方式

### 在代码中使用

```typescript
import { getSchemaStatements } from '@/service/sql';

// 获取所有 SQL 语句
const statements = getSchemaStatements();

// 执行 SQL 语句
for (const statement of statements) {
  await client.query(statement);
}
```

### 直接执行 SQL 文件

```bash
# 使用 psql 命令行工具
psql -U username -d database_name -f schema.sql

# 或使用环境变量
psql $PG_URL -f schema.sql
```

## 修改 SQL 结构

### 添加新表

1. 在 `schema.sql` 中添加新的 `CREATE TABLE` 语句
2. 添加相关的索引定义
3. 如果需要，添加外键约束
4. 重启应用，表结构会自动创建

### 修改现有表

**注意**：直接修改 `schema.sql` 不会自动更新已存在的表结构。

对于已部署的数据库，需要：

1. 创建数据库迁移脚本（migration）
2. 使用 `ALTER TABLE` 语句修改表结构
3. 在生产环境谨慎执行

### 添加索引

1. 在 `schema.sql` 中添加 `CREATE INDEX` 语句
2. 使用 `IF NOT EXISTS` 确保幂等性
3. 重启应用，索引会自动创建

## SQL 编写规范

### 1. 使用 IF NOT EXISTS

所有 `CREATE TABLE` 和 `CREATE INDEX` 语句都应该使用 `IF NOT EXISTS`：

```sql
CREATE TABLE IF NOT EXISTS table_name (...);
CREATE INDEX IF NOT EXISTS idx_name ON table_name(column);
```

### 2. 添加注释

使用 SQL 注释说明表和字段的用途：

```sql
-- ============================================
-- 表名：用途说明
-- ============================================
CREATE TABLE IF NOT EXISTS table_name (
  id SERIAL PRIMARY KEY,           -- 主键
  name VARCHAR(255) NOT NULL,      -- 名称
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- 创建时间
);
```

### 3. 字段命名规范

- 使用 snake_case 命名（PostgreSQL 标准）
- 时间字段使用 `_at` 后缀（如 `created_at`）
- 布尔字段使用 `is_` 前缀（如 `is_enabled`）
- 外键字段使用 `_id` 后缀（如 `task_id`）

### 4. 索引命名规范

- 单列索引：`idx_表名_列名`
- 复合索引：`idx_表名_列名1_列名2`
- 唯一索引：`uniq_表名_列名`

### 5. 数据类型选择

- 主键：`SERIAL` 或 `VARCHAR(50)`
- 短文本：`VARCHAR(n)`
- 长文本：`TEXT`
- 数字：`INTEGER`、`BIGINT`、`DECIMAL(m,n)`
- 布尔：`BOOLEAN`
- 时间：`TIMESTAMP`
- JSON：`JSONB`（推荐）或 `JSON`

## 初始化流程

### 首次启动

```
1. 应用启动
2. 连接 PostgreSQL
3. 检查 task_configs 表是否存在 → 不存在
4. 执行 schema.sql 中的所有语句
5. 加载 taskConfigs.ts 中的初始配置
6. 初始化完成
```

### 后续启动

```
1. 应用启动
2. 连接 PostgreSQL
3. 检查 task_configs 表是否存在 → 已存在
4. 执行 schema.sql（CREATE IF NOT EXISTS，跳过已存在的表）
5. 跳过初始配置加载
6. 初始化完成
```

## 故障排查

### 表创建失败

1. 检查 PostgreSQL 连接是否正常
2. 检查用户权限是否足够
3. 查看应用日志中的详细错误信息
4. 检查 SQL 语法是否正确

### 索引创建失败

1. 检查表是否已存在
2. 检查列名是否正确
3. 检查是否有重复的索引名称

### 初始配置加载失败

1. 检查 `taskConfigs.ts` 文件是否存在
2. 检查配置格式是否正确
3. 查看应用日志中的详细错误信息

## 最佳实践

1. **版本控制**：将 SQL 文件纳入 Git 版本控制
2. **备份**：修改前备份现有的 SQL 文件
3. **测试**：在开发环境测试 SQL 语句后再部署
4. **文档**：及时更新注释和文档
5. **迁移**：使用专门的迁移工具管理表结构变更

## 相关文件

- `projects/admin/src/service/common/postgres.ts` - PostgreSQL 连接和初始化
- `projects/admin/src/service/core/task/taskConfigs.ts` - 任务配置定义
- `projects/admin/src/service/common/POSTGRES_INIT.md` - 初始化流程说明
