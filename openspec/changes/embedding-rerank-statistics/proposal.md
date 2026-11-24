# Proposal

## Why

管理后台的统计数据(内部统计页 + 对外统计接口)目前只覆盖对话模型(LLM)调用:抽取管道按 5 类 LLM 消费节点过滤,知识库搜索节点(向量、重排模型的主要消费方)整体被排除,向量/重排等模型的用量对运营不可见。业务需要掌握全部模型消耗(调用量、Token 数),因此将向量、重排及搜索节点内其他模型的用量纳入统计口径。

## What Changes

- **抽取管道**:知识库搜索节点(`datasetSearchNode`)的响应不再整体丢弃,按参与模型拆分为多行调用记录:
  - 向量行(`modelCategory=embedding`):`embeddingModel` + `embeddingTokens`,搜索执行即产生;
  - 重排行(`modelCategory=rerank`):`rerankModel` + `reRankInputTokens`,仅实际启用重排时产生;
  - 搜索内问题优化 LLM 行(`modelCategory=chat`):`queryExtensionResult.model` + tokens,启用问题优化时产生;
  - 深度搜索 LLM 行(`modelCategory=chat`):`deepSearchResult.model` + tokens,启用深度搜索时产生;
  - `call_id` 使用子键(`${responseData.id}:embedding`、`:rerank`、`:ext_llm`、`:deep_llm`)保持唯一约束与幂等;
  - `usage_scenario` 统一为 `datasetSearchNode`;积分(`totalPoints`)全部记 0(当前部署积分恒为 0,不做按模型分摊);`runningTime`(节点级)仅记在向量行;
- **查询层**:全部统计 API(内部 7 个 + 对外 1 个)新增可选 `modelCategory` 筛选参数,取值枚举 `chat | embedding | rerank`,支持多值(逗号分隔或重复参数,命中任一类别即返回,数量上限 50,复用 appId/modelId 的多值机制),不传 = 不过滤;
- **响应结构**:统计列表 / 导出 / 对外接口的行数据新增 `modelCategory` 字段(取值 `chat | embedding | rerank`,存量 chat 行不受影响);
- **前端**:统计页筛选面板新增「模型类别」下拉;统计列表与导出增加模型类别列(中文映射:对话 / 向量 / 重排);
- **存量数据**:PG 现存数据无向量/重排行(2026-11-23 摸底确认);历史区间的向量/重排行需手动重跑 data-process 任务回填,前置条件为确认 Mongo 源数据保留情况与容器 TZ 对齐(见上线评审 P0);
- **既有行为不变**:5 类 LLM 节点的抽取逻辑、`call_id` 生成、字段映射保持原样;总览指标(总调用次数/总 Token)在回填后会因纳入新行而变大,属预期口径变化。

## Capabilities

### New Capabilities

- `model-usage-extraction`: 数据抽取的多模型拆分口径——知识库搜索节点响应拆行为按模型的调用记录(向量/重排/搜索内问题优化 LLM/深度搜索 LLM)、`call_id` 子键与幂等、调用状态判定、积分与耗时记法、模型归因的配置回退行为。

### Modified Capabilities

- `statistics-query-filters`: 新增 `modelCategory` 筛选需求——内部统计 API 与对外统计接口共用,单选枚举,内外查询行为一致。
- `external-statistics-api`: 对外统计接口新增 `modelCategory` 查询参数;响应行新增 `modelCategory` 字段。

## Impact

- **代码**(均在 `projects/admin`):
  - `src/service/core/datacap/collect.ts`:聚合管道放行 `datasetSearchNode`、投影与拆行转换、状态判定;
  - `src/service/core/statistics/queryBuilder.ts`:WHERE 增加 `model_category` 条件;
  - `src/service/core/statistics/validation.ts`:`modelCategory` 参数校验(枚举、空值忽略);
  - `src/service/core/statistics/statistics.ts` / `statisticsService.ts`:类型与行映射补充 `modelCategory`;
  - `src/pages/api/statistics/*`(7 个路由)与 `src/pages/api/external/statistics/list.ts`:参数透传;
  - 前端 `FilterPanel` / `StatisticsList` / `ExportButton` / `web/core/statistics/api.ts`:筛选与展示列;
  - `docs/external-statistics-api.md`:契约更新。
- **数据库**:无 DDL 变更(`model_category` 列与索引已存在于 `schema.sql:25,41`)。
- **数据**:历史区间回填依赖 Mongo 源数据保留;重跑区间受时基问题影响(P0,先定版再回填);向量模型归因在模型配置缺失时会静默回退到系统默认向量模型(归因漂移,见 design)。
- **外部契约**:三方接口为增量式变更(新增可选参数、响应行新增字段),向后兼容;总览数值在回填后变大。
- **测试**:collect 拆行 / queryBuilder / validation / 对外接口的既有单测套件扩展。
