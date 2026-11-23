# Design: appId/modelId 多值筛选

## Context

统计查询的参数校验（`validation.ts` 的 `validateAndCleanQuery`）与 SQL 构建（`queryBuilder.ts` 的 `QueryBuilder`）为内部 7 个 API（`/api/statistics/*`）与对外 API（`/api/external/statistics/list`）共用。当前 `StatisticsQuery.appId/modelId` 为 `string` 单值，SQL 为 `app_id = $n`、`model_id = $n` 单值等值条件。动机见 proposal.md。

关键约束：
- Next.js 对查询串的解析：重复参数（`appId=a&appId=b`）→ `req.query.appId` 为 `string[]`；逗号分隔（`appId=a,b`）→ `string`
- pg 驱动原生支持将 JS 数组序列化为 Postgres 数组参数
- 前端 `projects/admin/src/web/core/statistics/api.ts` 仅发送单值，本次不改前端
- 单值行为与响应结构必须完全不变（向后兼容）

## Goals / Non-Goals

**Goals**
- appId/modelId 支持多值（逗号分隔 + 重复参数两种语法），参数内 OR、参数间 AND
- 内外 API 同步生效，共用一套解析与校验
- 单值传参行为、响应结构、分页行为不变

**Non-Goals**
- 不改前端统计页面（UI 多值筛选另立 change）
- 不清理既有校验器把非分页错误兜底为 INVALID_TIME_RANGE 的历史遗留
- 不引入 appName/modelName 的多值（名称类保持单值模糊匹配）

## Decisions

### D1: 多值传参语法——同时支持逗号分隔与重复参数

两种语法均接受，解析层归一化。理由：重复参数是 HTTP 自然惯例（各 HTTP 客户端开箱即用），逗号分隔对三方拼 URL 最直观；只支持其一都会让部分调用方意外失败。两语法可混用（`appId=a,b&appId=c` → `[a, b, c]`）。

*备选*：仅逗号分隔（实现最简）；仅重复参数。均因兼容面窄被否。

### D2: 内部类型归一化——`StatisticsQuery.appId/modelId` 从 `string` 改为 `string[]`

`validateAndCleanQuery` 负责把 HTTP 层的 `string | string[]` 解析归一化为 `string[]`（单值 → `[value]`），下游 QueryBuilder 与服务层只处理数组形态，不感知传参语法。

*备选*：保留 `string | string[]` 联合类型贯穿到 SQL 层——所有消费方都要处理两种形态，复杂度扩散，否。

### D3: SQL 形式——`= ANY($n)` 单数组参数

`buildAppFilter`/`buildModelIdFilter` 生成 `app_id = ANY($n)` / `model_id = ANY($n)`，`values = [ids]`。参数序号推进逻辑不变（每个条件仍占 1 个序号），`buildWhereClause` 的调用方零改动。

*备选*：`IN ($n, ..., $n+k-1)` 动态 N 个占位符——占位符生成与序号推进复杂、测试矩阵翻倍，无性能优势，否。

### D4: 解析与校验规则（`validation.ts`）

输入 `string | string[] | undefined`：
1. `undefined` 或整体 trim 后为空的字符串 → `undefined`（视同未传，兼容现状 `appId=` 行为）
2. 字符串按 `,` 分割；数组直接逐项处理
3. 每项独立 trim；trim 后为空 → 400 `INVALID_FILTER_PARAM`（「取值不能为空」，覆盖 `a,,b` 与纯空白）
4. 去重（保持首次出现顺序）
5. 去重后数量 > 50 → 400 `INVALID_FILTER_PARAM`（「取值数量不能超过 50」）
6. 其余情况 → `string[]`

既有行为变化说明：现状纯空白单值（如 `appId=%20%20`）报 INVALID_TIME_RANGE +「应用ID不能为空」；新规则改报 INVALID_FILTER_PARAM，错误消息文本保留「不能为空」语义。这是错误码语义修正，需同步更新既有测试断言（`validation.test.ts` 的空白用例）。

### D5: 新增错误码 `INVALID_FILTER_PARAM`

`StatisticsErrorCode` 枚举新增 `INVALID_FILTER_PARAM = 'INVALID_FILTER_PARAM'`，HTTP 400。不复用 INVALID_TIME_RANGE（语义不符）；响应结构与既有错误一致（code/message/details），满足对外「与内部统计 API 结构一致」约束。

### D6: 数量上限 50

常量 `MAX_ID_FILTER_VALUES = 50` 从 validation.ts 导出。50 个 `= ANY` 元素对 Postgres 无查询计划压力；上限防滥用并保持行为可预期。如需调整只改常量与规格数值。

### D7: 路由参数类型——`string | string[]`

8 个路由文件（external/statistics/list 与 statistics/{list,by-app,by-model,overview,trend,status,export}）的 QueryParams 中 `appId/modelId` 类型改为 `string | string[]`，如实反映 HTTP 形态；校验后的类型仍为 `string[]`。

## Risks / Trade-offs

- [appId 含逗号的字面值无法再精确匹配] → FastGPT appId 为 ObjectId（24 位十六进制，不含逗号），modelId 为模型标识符（不含逗号）；实际影响可忽略，接口文档注明逗号为分隔符
- [纯空白单值错误码变化（INVALID_TIME_RANGE → INVALID_FILTER_PARAM）] → 语义更准确的 400，消息文本不变；更新既有测试
- [数组参数的驱动兼容性] → node-pg 原生支持；queryBuilder 单测 + integration 测试覆盖生成的 SQL 与参数
- [内部 API 同步获得多值能力] → 规格要求（statistics-query-filters「内外一致」），非风险；各内部路由仅类型标注与共用校验变更，行为扩展一致生效

## Migration Plan

无数据库 schema 变更、无配置变更。单次部署生效；回滚即回退代码。三方既有单值请求不受影响，无需改造。

## 测试计划（先于代码编写）

按「设计 → 测试示例 → 代码 → 运行 → 修正」模式：

1. `validation.test.ts`：单值归一化为数组；逗号分隔/重复参数/混合语法解析；空白取值（`a,,b`、纯空白）报 INVALID_FILTER_PARAM；空字符串视同未传；去重保持顺序；超 50 报错；恰好 50 通过
2. `queryBuilder.test.ts`：`buildAppFilter`/`buildModelIdFilter` 生成 `= ANY($n)` 与数组参数值；与其他条件组合时参数序号连续
3. `integration.test.ts`：appId 多值 + modelId 多值 + appName/modelName 组合生成正确 SQL 与参数
4. `external/statistics/__tests__/list.test.ts`：多值请求 200 且筛选生效；空白取值 400 INVALID_FILTER_PARAM；超限 400；单值请求行为与既有快照一致
