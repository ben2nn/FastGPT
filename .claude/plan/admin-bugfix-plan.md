# Admin 项目缺陷修复方案

## 一、P0 — 认证与权限

### 1.1 强化 `authAdmin` 校验管理员角色 ✅

**文件**: `src/service/support/permission/auth.ts`

**已完成**: 增加 `isRoot` 校验，非 root 用户返回 `ERROR_ENUM.unAuthorization`。

### 1.2 给 20 个裸奔端点补上认证 ✅

**需修复的文件列表**:

| 文件路径 | 当前状态 | 修复方式 |
|---------|---------|---------|
| `api/extend/user/index.ts` | 认证代码被注释 | 补上 `authAdmin` |
| `api/extend/user/[id].ts` | 无认证代码 | 补上 `authAdmin` |
| `api/extend/team/index.ts` | 无认证代码 | 补上 `authAdmin` |
| `api/extend/team/[id].ts` | 无认证代码 | 补上 `authAdmin` |
| `api/extend/team/[id]/members.ts` | 无认证代码 | 补上 `authAdmin` |
| `api/admin/tasks/list.ts` | TODO 注释 | 启用 `authAdmin` |
| `api/admin/tasks/[taskId]/detail.ts` | TODO 注释 | 启用 `authAdmin` |
| `api/admin/tasks/[taskId]/execute.ts` | TODO 注释 | 启用 `authAdmin` |
| `api/admin/tasks/[taskId]/toggle.ts` | TODO 注释 | 启用 `authAdmin` |
| `api/admin/tasks/[taskId]/executions.ts` | TODO 注释 | 启用 `authAdmin` |
| `api/admin/tasks/executions/[executionId].ts` | TODO 注释 | 启用 `authAdmin` |
| `api/statistics/overview.ts` | 认证代码被注释 | 启用 `authAdmin` |
| `api/statistics/trend.ts` | 认证代码被注释 | 启用 `authAdmin` |
| `api/statistics/status.ts` | 认证代码被注释 | 启用 `authAdmin` |
| `api/statistics/by-app.ts` | 认证代码被注释 | 启用 `authAdmin` |
| `api/statistics/by-model.ts` | 认证代码被注释 | 启用 `authAdmin` |
| `api/statistics/list.ts` | 无认证代码 | 补上 `authAdmin` |
| `api/statistics/export.ts` | 认证代码被注释 | 启用 `authAdmin` |

**统一模式**: 在 handler 函数开头添加 `await authAdmin(req);`

---

## 二、P1 — 功能缺陷

### 2.1 SQL 列数不匹配（数据丢失 Bug）✅

**文件**: `src/service/core/datacap/storage.ts`

**已完成**: `fallbackInsertOneByOne` 补齐 `error_text` 列（$19），`client` 类型改为 `PoolClient`。

### 2.2 3 个队列文件吞掉错误详情 ✅

**已完成**: `return { error: true }` → `return { error }`，保留实际错误对象。

### 2.3 login.ts 未 await 异步操作 ✅

**已完成**: 加上 `await`。

### 2.4 ensureInitialized 失败后永不重试 ✅

**已完成**: 增加 `MAX_INIT_RETRIES = 3` 重试机制，失败后自动重置为 PENDING 允许重试。

---

## 三、P2 — 代码质量

### 3.1 清理未使用的导入（7 个文件）✅

### 3.2 console 替换为 addLog（11 个 API 文件）✅

### 3.3 提取重复的 formatNumber 工具函数

### 3.4 类型定义修复 ✅
- `errors.ts:29`: `SystemError.name` 从 `'DataCapError'` 改为 `'SystemError'`
- `statistics.ts`: `StatisticsError` 增加 `Object.setPrototypeOf`

### 3.5 Promise.reject 使用 Error 对象 ✅
11 处 `Promise.reject('字符串')` 改为 `Promise.reject(new Error('字符串'))`。

---

## 执行顺序建议

1. **先做 1.1** — 强化 `authAdmin`，这是所有认证的基础
2. **再做 1.2** — 批量给 20 个路由补认证
3. **做 2.1** — SQL 列数 Bug，会导致数据丢失
4. **做 2.2-2.3** — 错误处理和 await 修复
5. **最后做 P2** — 代码质量改进，可分批进行
