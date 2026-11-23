# Proposal

## Why

管理后台的模型调用统计数据（`model_call_logs`）目前只能通过内部统计页面访问，API 使用管理员 session（cookie + isRoot）认证，无法安全地提供给外部系统。三方系统（如客户的业务平台、报表系统）需要以程序化方式拉取统计数据，用于自有系统的报表展示与数据分析，因此需要一套独立的对外授权机制和对外统计接口。

## What Changes

- **新增 API Key 授权体系**：
  - 新增 PostgreSQL 表 `api_keys`，存储对外授权 Key（Key 值哈希、名称/备注、状态、创建/更新时间、最近使用时间）
  - 新增 Key 生命周期管理：管理员在后台创建、禁用/启用、删除 Key，创建时一次性返回完整 Key（仅存哈希，不可再次查看）
  - 对外接口统一使用 `Authorization: Bearer <key>` 认证，校验 Key 存在且启用，并记录最近使用时间
- **新增对外统计接口**：`GET /api/external/statistics/list`，三方通过 API Key 授权拉取按「应用 + 模型」分组的统计列表数据（调用次数、tokens、积分消耗、成功率、平均耗时等），复用内部统计列表的数据结构与查询逻辑
- **查询条件升级**（对外接口与内部统计 API 共用查询构建器）：
  - 新增 `modelId` 精确筛选（现有查询只有 modelName，表字段 `model_id` 已存在但未暴露）
  - `modelName` 由精确匹配升级为模糊匹配（ILIKE，与应用名称 `appName` 的模糊匹配行为一致）
  - 支持的完整查询条件：`appId`（精确）、`appName`（模糊）、`modelId`（精确）、`modelName`（模糊）、`startTime`/`endTime`（必填，时间区间）、`pageNum`/`pageSize`（分页）
- **内部统计 API 同步升级**：内部统计接口（list、export 等）同步支持 `modelId` 参数；`modelName` 行为从精确匹配变为模糊匹配（**BREAKING**：原先按精确名查询的内部调用方，改用模糊匹配后可能返回更多结果）

## Capabilities

### New Capabilities

- `external-api-auth`: 对外 API Key 授权体系。覆盖 api_keys 表结构、Key 的生成与哈希存储、管理员对 Key 的创建/启用/禁用/删除、Bearer Token 认证校验及使用记录
- `external-statistics-api`: 对外统计列表查询接口。覆盖 `/api/external/statistics/list` 的鉴权接入、查询参数（应用ID/应用名称/模型ID/模型名称/时间区间/分页）、响应结构、错误码与安全约束
- `statistics-query-filters`: 统计查询筛选条件。覆盖统计查询共享的筛选行为：modelId 精确筛选、appName 与 modelName 模糊匹配、时间区间与分页约束（内部 API 与对外 API 共用同一查询构建器）

### Modified Capabilities

（无——项目尚无已有 spec，全部为新增能力）

## Impact

- **数据库**：`projects/admin/src/service/sql/schema.sql` 新增 `api_keys` 表；需同步 `schemaContent.ts` 初始化逻辑（如需要）
- **统计服务层**：`projects/admin/src/service/core/statistics/` 下的 `statistics.ts`（类型）、`queryBuilder.ts`（modelId 条件、modelName 模糊）、`validation.ts`（modelId 校验）、`statisticsService.ts`
- **内部统计 API**：`projects/admin/src/pages/api/statistics/`（list、export 等支持新参数；行为变化：modelName 模糊匹配）
- **新增对外 API**：`projects/admin/src/pages/api/external/statistics/list.ts`
- **新增 API Key 管理**：管理端 API（`projects/admin/src/pages/api/external/keys/` 或类似路径）+ 管理页面（`projects/admin/src/pageComponents/`、`projects/admin/src/pages/`）+ Key 认证服务（`projects/admin/src/service/support/` 或 `service/common/`）
- **安全影响**：新增对外暴露面，需考虑 Key 哈希存储、防暴力枚举（响应一致性）、查询频率约束
