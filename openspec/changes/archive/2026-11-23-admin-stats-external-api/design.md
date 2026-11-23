# Design

## Context

admin 项目已有完整的内部统计模块：

- 数据层：PostgreSQL 表 `model_call_logs`（schema.sql 集中管理，初始化时执行 `CREATE TABLE IF NOT EXISTS`），查询构建器 `queryBuilder.ts`（参数化 SQL）、服务 `statisticsService.ts`（连接池 + 超时控制）、校验 `validation.ts`
- 内部 API：`/api/statistics/list|overview|by-app|by-model|trend|status|export`，统一 `authAdmin` 认证（`fastgpt_token` session + isRoot）
- 现有筛选：appId（精确）、appName（ILIKE 模糊，含通配符转义）、modelName（**精确 `=`**）、callStatus、时间区间、分页；**无 modelId 筛选**（表字段 `model_id` 已存在）
- 内部统计列表响应（`StatisticsListItem`）**不含 modelId**（仅 modelName）
- admin 项目无 API Key 体系；仅 `system/init.ts` 有简单的静态 `INIT_TOKEN` Bearer 校验先例

详见 proposal.md（动机）与三个 spec（行为要求）。

## Goals / Non-Goals

**Goals:**

- 独立于 session 的 API Key 授权体系（数据库管理、哈希存储、可启停可审计）
- 对外统计列表接口，与内部接口共用查询构建、校验与响应结构
- 查询能力升级：modelId 精确筛选、modelName 模糊匹配（内外一致）
- 管理后台提供 Key 管理页面

**Non-Goals:**

- Key 级别的调用频率限制（限流）——先用查询超时、365 天区间上限、pageSize≤100 兜底；后续如需再加
- 对外暴露 overview / by-app / by-model / trend / status / export（本期仅 list）
- Key 作用域/权限细分（如限定可访问的应用范围）——本期所有 Key 权限等同
- OpenAPI 文档生成与三方 SDK——本期提供接口文档说明即可

## Decisions

### D1: Key 生成与存储——高熵随机串 + SHA-256 哈希

- Key 格式：`dek_<43字符 base64url（32 字节随机）>`，前缀 `dek_` 便于日志脱敏与肉眼识别
- 存储仅存 SHA-256 hex 哈希（64 字符，UNIQUE 索引）+ 展示用前缀（如 `dek_a3f...`）
- 认证时对传入 Key 做 SHA-256 后按哈希等值查询

**为什么不用 bcrypt/scrypt 慢哈希**：API Key 是 256 位高熵随机值，不存在字典/暴力枚举空间，慢哈希只增加每次请求的 CPU 延迟；SHA-256 等值查询可走索引。慢哈希适用于低熵人类密码。
**备选（拒绝）**：明文存储（泄露面过大）；HMAC 签名方案（对接复杂度高，本期无防重放需求）。

### D2: api_keys 表结构

```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(50) PRIMARY KEY,            -- nanoid
  key_hash VARCHAR(64) UNIQUE NOT NULL,  -- sha256 hex
  key_prefix VARCHAR(16) NOT NULL,       -- 展示用（前8字符 + '...'）
  name VARCHAR(100) NOT NULL,            -- 三方名称/备注
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_api_keys_enabled ON api_keys(enabled);
```

加入现有 `schema.sql`（复用 `CREATE TABLE IF NOT EXISTS` 的幂等初始化机制，`schemaContent.ts` 无需改动——它读取整个 schema.sql）。

### D3: 认证实现位置——`service/support/permission/authApiKey.ts`

新增 `authExternalApiKey(req)`：

1. 解析 `Authorization: Bearer <key>`，格式错误直接 401
2. SHA-256 → 查 `api_keys`（`key_hash = $1 AND enabled = true`），复用 `getPostgresPool()` 全局连接池
3. 命中 → 异步更新 `last_used_at`（不阻塞响应），返回 Key 记录
4. 未命中/禁用 → 统一 401 错误（不区分「不存在」与「已禁用」，防枚举）

**备选（拒绝）**：放进 `@fastgpt/service`（admin 专用能力，不该进共享包）；复用主应用 `apikey` 表（语义不同——那是面向 FastGPT 用户的 app 调用 Key）。

### D4: 对外接口——`/api/external/statistics/list.ts`

结构克隆内部 `list.ts`（GET 校验 → 参数校验 `validateAndCleanQuery` → `statisticsService.getStatisticsList`），仅两处差异：

- 认证从 `authAdmin` 换成 `authExternalApiKey`
- 日志记录 Key 前缀而非用户 ID

`/api/external/` 路径段明确隔离对外接口，未来扩展其他对外接口时复用同一认证。

### D5: 查询能力升级（共用 queryBuilder，内外一致）

- `StatisticsQuery` 新增 `modelId?: string`
- `buildWhereClause` 新增 `model_id = $n` 精确条件
- `buildModelFilter` 从 `model_name = $n` 改为 `model_name ILIKE $n ESCAPE '\\'` + `%...%` 包裹 + 通配符转义（与 `buildAppNameFilter` 一致）
- `validation.ts`：新增 modelId 非空字符串校验、cleanedQuery 增加 modelId 清洗；`StatisticsListQueryParams` 等内部 API 参数类型同步加 modelId
- 统计列表响应补充模型ID：`buildStatisticsListQuery` 的 SELECT/GROUP BY 加 `model_id`，`buildStatisticsListCountQuery` 子查询 GROUP BY 同步加 `model_id`，`StatisticsListItem` 类型加 `modelId: string`（内部 API 新增字段，向后兼容）
- 注意 `model_call_logs` 已有 `idx_timestamp_model`（call_timestamp, model_name）复合索引，模糊匹配走该索引的前缀部分；modelId 精确匹配可考虑新增 `idx_model_id` 索引（model_call_logs 表），在 tasks 中评估

**行为影响确认（用户已拍板）**：内部 API modelName 从精确变模糊；原有的精确匹配需求可用完整名称输入达到近似效果（完整名是自身的一个模糊子集，但当存在「A」与「A-pro」时，查「A」会同时命中两者——已在 spec 中记录为 BREAKING）。

### D6: Key 管理 API 与页面

- API：`/api/external/keys/`（GET list / POST create / PUT update / DELETE delete），全部 `authAdmin`，复用 `NextAPI` 中间件
  - create 返回完整 Key 明文（唯一一次）；list/update/delete 仅返回 `key_prefix`、name、enabled、时间字段
  - delete 的 id 从 query 或 body 读取（前端 request 封装的 DELETE 将参数置于 query，与内部 API 惯例一致）
- 页面：`projects/admin/src/pages/keys/index.tsx`（列表 + 创建/启停/删除操作），加入 `AdminSidebar` 菜单（「API 密钥」）
  - 创建成功弹窗展示完整 Key + 「仅显示一次，请立即保存」提示 + 复制按钮

### D7: 错误响应与安全细节

- 对外接口错误响应结构与内部统计 API 一致（`{ code, message, details }`）；401 统一返回 `UNAUTHORIZED` 语义，不区分 Key 状态
- 参数化查询沿用（queryBuilder 已保证）；模糊匹配通配符转义已内建（`escapeLikePattern`）
- addLog 记录每次对外调用：Key 前缀、来源 IP、筛选参数摘要、耗时、结果行数——作为基础审计

## Risks / Trade-offs

- **[内部 API BREAKING：modelName 模糊化]** → 已在 proposal/spec 标注；上线说明中告知内部调用方；完整名称查询在大多场景结果不变，仅当存在包含关系的名称时结果变宽
- **[Key 明文只在创建时返回一次，丢失需重建]** → 创建弹窗强提示 + 复制按钮；重新生成成本可控（新建一个 Key + 通知三方替换 + 删旧 Key）
- **[无请求频率限制，三方高频调用可能压库]** → 查询超时（15s）+ 365 天区间 + pageSize≤100 兜底；PG 连接池上限保护；后续可按 Key 增加限流（表已预留 enabled 字段可快速扩展）
- **[对外接口暴露面]** → 仅 GET 只读、参数化查询、错误响应不泄露 SQL/堆栈、401 响应不区分 Key 存在性；路径 `/api/external/` 与内部 API 隔离，便于网关层面统一管控
- **[list 查询 GROUP BY 增加 model_id 后行为变化]** → 同一 app + 不同 model_id 但相同 model_name 的记录会拆成多行（此前合并）。实际数据中 model_id 与 model_name 一一对应，影响可忽略；total 数可能微增
- **[last_used_at 高频写]** → 认证命中即写一次（每次请求一行 UPDATE），Key 数量少、频率可控时无压力；若成为瓶颈可改为内存聚合 + 定时批量落库（本期不做）

## Migration Plan

1. 合并代码后，部署新版本 admin 应用
2. 执行数据库初始化（已有机制自动执行 schema.sql，`CREATE TABLE IF NOT EXISTS api_keys` 幂等；或手动 `POST /api/system/init`）
3. 管理员在后台创建第一个 Key，交付三方并同步接口文档
4. 回滚策略：代码回滚即恢复原状（api_keys 表残留无害，无数据依赖）；紧急止血可禁用全部 Key（无需回滚代码）

## Open Questions

（无——授权方式、接口范围、模糊匹配兼容策略均已与用户确认）
