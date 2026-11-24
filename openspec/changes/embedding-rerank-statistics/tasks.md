# Tasks

## 1. 抽取管道:搜索节点拆行(collect.ts)

- [x] 1.1 聚合管道放行 `datasetSearchNode`:加入 `COLLECTABLE_MODULE_TYPES`,投影补充 `embeddingModel/embeddingTokens/rerankModel/reRankInputTokens/queryExtensionResult/deepSearchResult/totalPoints/runningTime` 原始字段;验证:用含搜索节点的样例文档跑 aggregate mock,确认字段到达 transform 层
- [x] 1.2 `transformDocument` 拆行:按 design D3 映射展开为 1~4 行(向量恒产生;重排/问题优化/深度搜索按字段存在性),call_id 子键 `${id}:embedding|:rerank|:ext_llm|:deep_llm`,`usage_scenario='datasetSearchNode'`,积分 0,runningTime 仅向量行;验证:单测覆盖四类行、缺重排字段只产向量行、子键互异
- [x] 1.3 拆分行状态判定:errorText→error;各模型 tokens>0→success 否则 error;节点 runningTime>30s 且无输出→timeout;验证:单测覆盖 success/error/timeout 三态
- [x] 1.4 既有 chat 行回归:5 类 LLM 节点拆行逻辑与 call_id 保持不变;验证:既有抽取相关单测全绿 + 新增一条「chat 行无子键」断言

## 2. 查询层与校验(statistics 服务)

- [x] 2.1 `validation.ts` 增加 `modelCategory` 校验:复用 `appId/modelId` 的多值解析(trim/去重/空白取值拒绝/上限 50)+ 每值枚举校验(chat/embedding/rerank),空串视同未传,任一取值非法抛 INVALID_FILTER_PARAM;验证:单测覆盖单值/逗号多值/重复参数归并/空白取值/超限/非法枚举/未传
- [x] 2.2 `queryBuilder.buildWhereClause` 增加 `model_category = ANY($n)` 单数组参数条件(与 buildAppFilter 同模式,占 1 个参数序号,枚举值来自校验层);验证:单测断言生成的 SQL 与参数序号,以及不传时 SQL 与现状一致
- [x] 2.3 `statistics.ts` 类型与 `statisticsService` 行映射补充 `modelCategory`(列表/导出/对外接口共用路径);验证:类型编译通过 + 列表查询 mock 返回含 modelCategory 字段

## 3. API 路由与对外接口

- [x] 3.1 内部 7 个统计路由(list/overview/trend/by-app/by-model/status/export)透传 `modelCategory` 到 `validateAndCleanQuery`;验证:单测断言参数可达 queryBuilder
- [x] 3.2 对外接口 `external/statistics/list.ts` 支持 `modelCategory` 多值查询参数(逗号分隔/重复参数,OR 语义)与空白/超限/非法枚举的 400(INVALID_FILTER_PARAM),响应行增加 `modelCategory` 字段;验证:扩展对外接口既有测试套件(单值/多值筛选、三类 400、字段存在)
- [x] 3.3 导出 `export.ts`:CSV/JSON 行增加「模型类别」列(中文映射:对话/向量/重排);验证:单测断言导出表头与行值

## 4. 前端展示与筛选

- [x] 4.1 `statistics.ts` 增加 `modelCategoryLabels` 映射(chat→对话/embedding→向量/rerank→重排)并导出;验证:单测断言映射与未知值原样返回
- [x] 4.2 `FilterPanel` 增加「模型类别」多选下拉(默认全部),选中值按逗号多值语法随查询参数传递;验证:勾选多个类别后网络请求携带 `modelCategory=chat,embedding` 形式参数,列表数据随之过滤
- [x] 4.3 `StatisticsList` 与 `ExportButton` 增加模型类别列并纳入导出;验证:页面渲染类别列,导出文件包含该列

## 5. 文档与集成验证

- [x] 5.1 更新 `projects/admin/docs/external-statistics-api.md`:新增 modelCategory 参数说明、响应行字段、口径扩展声明(总调用次数/总 Token 将包含向量与重排);验证:文档与接口实际行为一致(对照 3.2 的测试断言)
- [ ] 5.2 集成验证:本地/测试环境跑一次 data-process 任务,确认 PG 出现 `model_category=embedding/rerank` 行、call_id 带子键、重跑同区间行数不变;验证:对账 SQL `SELECT model_category, COUNT(*) ... GROUP BY 1` 输出符合预期
  - **环境阻塞(2026-11-24)**:本地 `MONGODB_URI` 指向的库全量 377 条节点响应中无 `datasetSearchNode` 源数据(时间范围 2026-01~08),无法产生向量/重排行的真实抽取。已完成无持久写入的替代验证:①PG 事务内(BEGIN/ROLLBACK)验证 `call_id` 子键唯一、重复插入 0 行、`model_category = ANY($n)` 命中;②全部 142 条单测通过。真实端到端验收移至部署环境(按 Workflow follow-up 回填时执行)。

## Workflow follow-up

- 上线评审 P0(TZ 定版)完成并确认 Mongo 源数据保留后,按 design「Migration Plan」分区间手动重跑 data-process 回填历史向量/重排数据(运维步骤,不在本 change 编码范围内)。
- 按项目评审要求完成人工复核后,执行 openspec verify / archive 归档本 change。
