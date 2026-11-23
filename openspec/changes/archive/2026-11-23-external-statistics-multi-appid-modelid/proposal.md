# Proposal

## Why

三方系统拉取统计数据时，经常需要一次获取多个应用或多个模型的数据。当前 `appId`、`modelId` 仅支持单值精确匹配，三方只能拆成多次请求再自行汇总，调用成本高、逻辑复杂。让两个 ID 类筛选条件支持多值，可以一次请求完成聚合查询。

## What Changes

- `appId` 从单值扩展为支持多值：单次请求可传入多个应用ID，返回这些应用的统计数据（命中任一即返回，OR 语义）
- `modelId` 同样从单值扩展为支持多值
- 多个 ID 之间的组合语义：同参数多值之间为 OR；appId 与 modelId 等不同条件之间仍为 AND
- **向后兼容**（非破坏性变更）：单值传参行为不变，响应结构与分页行为不变
- 查询参数校验与 SQL 构建为内外 API 共用逻辑，因此内部统计 API（`/api/statistics/*`）同步获得多值筛选能力，保持内外行为一致（符合 `statistics-query-filters` 的「内外查询行为一致」要求）
- SQL 层将 `app_id = $n`、`model_id = $n` 单值等值条件扩展为参数化的多值匹配，防注入约束不变

## Capabilities

### New Capabilities

（无——本次为既有能力的行为扩展，不引入新能力）

### Modified Capabilities

- `external-statistics-api`: 「查询条件」requirement 变更——`appId`、`modelId` 由单值精确匹配扩展为支持多值筛选（多值命中任一即返回），并补充多值场景的行为定义
- `statistics-query-filters`: 「模型ID筛选」requirement 变更——`modelId` 支持多值；「内外查询行为一致」requirement 随之覆盖多值场景（内部 API 同步支持）

## Impact

**代码**（均在 `projects/admin/` 下）：
- `src/service/core/statistics/statistics.ts` — `StatisticsQuery` 类型：`appId`/`modelId` 支持数组
- `src/service/core/statistics/validation.ts` — `validateAndCleanQuery`：多值参数的解析、清洗与校验
- `src/service/core/statistics/queryBuilder.ts` — `buildAppFilter`/`buildModelIdFilter`：多值 SQL 条件与参数序号
- `src/pages/api/external/statistics/list.ts` — 对外 API 查询参数类型与日志字段
- `src/pages/api/statistics/*.ts` — 内部 API（list/by-app/by-model/overview/trend/status/export）查询参数类型

**测试**：
- `validation.test.ts`、`queryBuilder.test.ts`、`integration.test.ts` 补充多值用例
- `src/pages/api/external/statistics/__tests__/list.test.ts` 补充对外接口多值场景

**兼容性**：向后兼容。既有单值请求行为完全不变；响应结构不变。无数据库 schema 变更。

**待设计决策**（放入 design.md）：多值传参语法（逗号分隔 / 重复参数 / 两者都支持）、SQL 形式（`= ANY($1)` vs 多占位符 `IN`）、空片段与数量上限的处理、多值上限阈值。
