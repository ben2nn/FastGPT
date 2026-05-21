# 数据库迁移指南

## 概述

本指南说明如何安全地修改数据库结构，包括添加表、修改字段、添加索引等操作。

## 迁移原则

1. **向后兼容**：新的变更不应破坏现有功能
2. **可回滚**：每个迁移都应该有对应的回滚方案
3. **测试优先**：在开发环境充分测试后再部署到生产环境
4. **文档完整**：记录每次迁移的目的和影响

## 常见迁移场景

### 1. 添加新表

#### 步骤

1. 在 `schema.sql` 中添加新表定义
2. 添加相关索引
3. 重启应用，表会自动创建

#### 示例

```sql
-- ============================================
-- 新表：用户操作日志
-- ============================================
CREATE TABLE IF NOT EXISTS user_action_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_user_action_logs_user_id ON user_action_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_action_logs_created_at ON user_action_logs(created_at DESC);
```

### 2. 添加新字段

#### 步骤

1. 创建迁移脚本（不要直接修改 schema.sql）
2. 使用 `ALTER TABLE` 添加字段
3. 更新应用代码以使用新字段
4. 部署到生产环境

#### 示例

创建文件 `migrations/001_add_user_email.sql`：

```sql
-- 添加用户邮箱字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 添加注释
COMMENT ON COLUMN users.email IS '用户邮箱地址';
```

执行迁移：

```bash
psql $PG_URL -f migrations/001_add_user_email.sql
```

### 3. 修改字段类型

#### 步骤

1. 评估影响范围（数据量、应用代码）
2. 创建迁移脚本
3. 在低峰期执行
4. 验证数据完整性

#### 示例

```sql
-- 将 VARCHAR(50) 扩展为 VARCHAR(100)
ALTER TABLE task_configs ALTER COLUMN id TYPE VARCHAR(100);

-- 修改数字类型
ALTER TABLE model_call_logs ALTER COLUMN total_points TYPE DECIMAL(12, 4);
```

### 4. 添加索引

#### 步骤

1. 在 `schema.sql` 中添加索引定义
2. 或创建独立的迁移脚本
3. 使用 `CONCURRENTLY` 避免锁表（生产环境）

#### 示例

```sql
-- 开发环境
CREATE INDEX IF NOT EXISTS idx_new_index ON table_name(column);

-- 生产环境（不锁表）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_new_index ON table_name(column);
```

### 5. 删除字段

#### 步骤

1. 确认字段不再被使用
2. 创建迁移脚本
3. 先在应用代码中移除对该字段的引用
4. 部署应用
5. 执行迁移删除字段

#### 示例

```sql
-- 删除字段
ALTER TABLE table_name DROP COLUMN IF EXISTS old_column;
```

### 6. 重命名字段

#### 步骤

1. 创建新字段
2. 复制数据到新字段
3. 更新应用代码使用新字段
4. 部署应用
5. 删除旧字段

#### 示例

```sql
-- 1. 添加新字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

-- 2. 复制数据
UPDATE users SET full_name = name WHERE full_name IS NULL;

-- 3. 删除旧字段（在应用更新后）
ALTER TABLE users DROP COLUMN IF EXISTS name;
```

## 迁移脚本管理

### 目录结构

```
sql/
├── schema.sql                    # 完整的表结构定义
├── migrations/                   # 迁移脚本目录
│   ├── 001_add_user_email.sql
│   ├── 002_add_task_priority.sql
│   └── 003_modify_token_type.sql
└── rollback/                     # 回滚脚本目录
    ├── 001_rollback.sql
    ├── 002_rollback.sql
    └── 003_rollback.sql
```

### 命名规范

- 使用序号前缀：`001_`, `002_`, `003_`
- 使用描述性名称：`add_user_email`, `modify_token_type`
- 使用 `.sql` 扩展名

### 迁移脚本模板

```sql
-- ============================================
-- 迁移编号：001
-- 迁移名称：添加用户邮箱字段
-- 创建时间：2024-01-15
-- 创建人：开发者名称
-- 描述：为 users 表添加 email 字段，用于用户邮箱验证
-- ============================================

-- 开始事务
BEGIN;

-- 执行迁移
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 验证迁移
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'email'
  ) THEN
    RAISE EXCEPTION '迁移失败：email 字段未创建';
  END IF;
END $;

-- 提交事务
COMMIT;

-- 记录迁移
INSERT INTO schema_migrations (version, name, applied_at) 
VALUES ('001', 'add_user_email', NOW())
ON CONFLICT (version) DO NOTHING;
```

### 回滚脚本模板

```sql
-- ============================================
-- 回滚编号：001
-- 回滚名称：移除用户邮箱字段
-- 对应迁移：001_add_user_email.sql
-- ============================================

BEGIN;

-- 执行回滚
DROP INDEX IF EXISTS idx_users_email;
ALTER TABLE users DROP COLUMN IF EXISTS email;

-- 删除迁移记录
DELETE FROM schema_migrations WHERE version = '001';

COMMIT;
```

## 生产环境迁移流程

### 1. 准备阶段

- [ ] 编写迁移脚本
- [ ] 编写回滚脚本
- [ ] 在开发环境测试
- [ ] 在测试环境验证
- [ ] 评估执行时间和影响范围
- [ ] 准备监控和告警

### 2. 执行阶段

- [ ] 备份数据库
- [ ] 通知相关人员
- [ ] 在低峰期执行
- [ ] 监控执行过程
- [ ] 验证迁移结果

### 3. 验证阶段

- [ ] 检查表结构
- [ ] 验证数据完整性
- [ ] 测试应用功能
- [ ] 检查性能指标
- [ ] 确认无异常日志

### 4. 回滚准备

如果迁移失败：

- [ ] 立即执行回滚脚本
- [ ] 恢复数据库备份（如需要）
- [ ] 通知相关人员
- [ ] 分析失败原因
- [ ] 修复问题后重新执行

## 最佳实践

### 1. 使用事务

```sql
BEGIN;
-- 迁移操作
COMMIT;
```

### 2. 添加验证

```sql
DO $
BEGIN
  IF NOT EXISTS (...) THEN
    RAISE EXCEPTION '迁移失败';
  END IF;
END $;
```

### 3. 记录迁移历史

创建迁移记录表：

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4. 使用 IF EXISTS / IF NOT EXISTS

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
DROP INDEX IF EXISTS idx_old_index;
```

### 5. 大表迁移优化

对于大表（百万级以上记录）：

```sql
-- 分批更新
DO $
DECLARE
  batch_size INTEGER := 10000;
  offset_val INTEGER := 0;
BEGIN
  LOOP
    UPDATE table_name
    SET new_column = old_column
    WHERE id IN (
      SELECT id FROM table_name
      WHERE new_column IS NULL
      LIMIT batch_size
    );
    
    EXIT WHEN NOT FOUND;
    offset_val := offset_val + batch_size;
    
    -- 暂停一下，避免长时间锁表
    PERFORM pg_sleep(0.1);
  END LOOP;
END $;
```

## 故障排查

### 迁移失败

1. 检查错误日志
2. 验证 SQL 语法
3. 检查权限
4. 检查依赖关系（外键、索引等）

### 性能问题

1. 使用 `EXPLAIN ANALYZE` 分析查询
2. 检查索引是否生效
3. 考虑使用 `CONCURRENTLY` 创建索引
4. 分批处理大量数据

### 数据不一致

1. 检查迁移脚本逻辑
2. 验证数据转换规则
3. 使用事务确保原子性
4. 必要时回滚并修复

## 工具推荐

- **psql** - PostgreSQL 命令行工具
- **pgAdmin** - PostgreSQL 图形化管理工具
- **DBeaver** - 通用数据库管理工具
- **Flyway** - 数据库迁移工具
- **Liquibase** - 数据库版本控制工具

## 相关文档

- [schema.sql](./schema.sql) - 数据库表结构定义
- [README.md](./README.md) - SQL 文件管理说明
- [POSTGRES_INIT.md](../common/POSTGRES_INIT.md) - 初始化流程说明
