# Design

## Context

统计唯一数据源为 PG `model_call_logs`,由 admin 的 data-process 任务从 Mongo(`chat_item_responses` 等)抽取写入。现行抽取按 5 类 LLM 消费节点过滤,知识库搜索节点整体被排除;`model_category` 列与索引已存在但恒为 `chat`,查询端从未使用。动机与范围见 proposal.md,行为契约见 specs(delta)。

关键现状事实(2026-11-23 摸底与代码核对):

- v4.14.6 搜索节点响应单条记录混合多个模型用量:`embeddingModel/embeddingTokens` 恒有;`rerankModel/reRankInputTokens` 仅实际启用重排时存在;`queryExtensionResult`、`deepSearchResult` 为可选的 LLM 明细;`totalPoints` 为节点合计,无按模型明细;
- usage 账单集合的按模型明细字段已废弃,`chat_item_responses` 是唯一可靠来源;
- `responseData.id`(响应 ID)是现行 `call_id` 来源,表上有唯一约束,依赖 `ON CONFLICT (call_id) DO NOTHING` 幂等;
- PG 现存数据无向量/重排行;仅有 3 条 chat/tools 的 unknown 行(保留不动);
- 向量模型名在调用时经 `getEmbeddingModel` 解析,配置缺失会静默回退系统默认向量模型;重排模型配置缺失时响应中直接无重排字段。

## Goals / Non-Goals

**Goals:**

- 向量、重排、搜索内问题优化 LLM、深度搜索 LLM 的调用记录进入 `model_call_logs`,与 chat 行同口径参与全部统计;
- 全部统计 API(内部 7 + 对外 1)支持 `modelCategory` 单选枚举筛选,内外行为一致;
- 统计列表、导出、对外接口行数据携带 `modelCategory`;前端增加类别筛选与展示列;
- 拆行幂等,重跑区间不产生重复数据;既有 chat 行为与数据零影响。

**Non-Goals:**

- 不做积分按模型分摊(当前部署积分恒为 0;将来启用积分时需另行设计);
- 不修改 FastGPT 主应用的响应写入结构;
- 不处理既有 3 条 unknown 行;
- 不在本 change 内自动回填历史数据(回填为部署后的手动运维步骤,见 Migration)。

## Decisions

### D1 拆行发生在 JS 转换层,聚合管道只放行+投影

聚合管道 `$in` 放行列表加入 `datasetSearchNode`,投影保留响应原始字段(`embeddingModel/embeddingTokens/rerankModel/reRankInputTokens/queryExtensionResult/deepSearchResult/totalPoints/runningTime` 等),拆行在 `transformDocument` 的 JS 层完成:一条搜索响应文档展开为 1~4 行 `ModelCallLog`。

- 备选:在 Mongo 聚合管道内拆($project 多次投影后 $unionWith)— 管道复杂度陡增、调试困难,且字段条件分支(重排是否启用)在 JS 里一行判断即可。选 JS 层。

### D2 call_id 子键:`${responseData.id}:{embedding|rerank|ext_llm|deep_llm}`

- 唯一性:同一响应的各行互不冲突;跨响应靠原始响应 ID 的唯一性传递;
- 幂等:复用现有 `ON CONFLICT (call_id) DO NOTHING`,重跑区间天然去重;
- 兼容:chat 行保持无子键的原始 ID,存量数据无需迁移;
- 批量插入的占位符逻辑(`storage.ts`)按 logs 数组长度生成,行数变化无需改动。

### D3 拆行字段映射与状态判定

| 行 | modelId | tokens | callStatus |
|---|---|---|---|
| 向量 | `embeddingModel` | `embeddingTokens` | errorText→error;否则 tokens>0→success,否则 error |
| 重排 | `rerankModel` | `reRankInputTokens` | 同上 |
| 问题优化 | `queryExtensionResult.model` | input+outputTokens | 同上 |
| 深度搜索 | `deepSearchResult.model` | input+outputTokens | 同上 |

- 模型名缺失时记 `unknown`(与 chat 行现行规则一致);
- 超时判定沿用现行节点级规则(`runningTime>30s` 且无输出→timeout,应用于该响应拆出的全部行);
- 重排行的产生条件:响应中存在重排模型名或重排 tokens 字段(即调用时实际执行了重排)。

### D4 积分记 0,runningTime 仅记向量行

节点 `totalPoints` 是多模型合计,拆行后逐行记 0,避免统计合计被放大;`runningTime` 是节点级总耗时,仅记在向量行(主行),其余行留空,避免每模型耗时虚增。

### D5 modelCategory 参数:多值枚举,复用 appId/modelId 机制

语法与语义完全复用既有 `appId`/`modelId` 多值机制:逗号分隔或重复参数传参、参数内 OR(命中任一类别即返回)、每值 trim、空白取值→400 `INVALID_FILTER_PARAM`、单参数取值上限 50、空字符串视同未传。在既有 `parseIdFilterValues` 的解析结果上追加枚举校验(chat/embedding/rerank),任一取值越界→400。`queryBuilder.buildWhereClause` 增加 `model_category = ANY($n)` 单数组参数条件(与 `buildAppFilter` 同模式,占 1 个参数序号)。内部 7 个路由与对外接口共用 `validateAndCleanQuery`,自动一致。

- 备选:单选枚举(原设计)— 用户明确要求多选;复用现成多值机制边际成本低,且与 appId/modelId 行为一致降低三方接入理解成本。

### D6 归因快照原则

抽取只读响应快照中的模型名,不查当前模型配置(现行 chat 行即如此)。配置删除导致的归因漂移(向量回退默认模型名)是调用时已发生的事实,抽取层不修正、也无法修正。

## Risks / Trade-offs

- [向量归因漂移:删配置期间的向量调用,快照里已是默认向量模型名,统计会归因到错误模型] → 无法事后修复;在对外文档注明模型名为调用时快照;运维上避免频繁删除模型配置。
- [删配置窗口的重排调用缺失:当时重排未实际执行,响应中无重排字段,回填后该窗口无重排行] → 属实情而非缺陷;回填前用摸底 SQL 确认该窗口搜索量,预期内缺口记录到回填说明。
- [历史回填依赖手动重跑,受时基 P0 影响:区间边界错 8 小时会造成跨天错行] → 回填前置条件:先完成上线评审 P0 的 TZ 定版与对账,再按整日区间重跑。
- [总览口径变大:总调用次数/总 Token 在回填后显著增长,可能引起三方或运营质疑] → 发布说明与对外文档同步声明口径扩展;对外接口口径变化已写入 spec。
- [大区间重跑耗时:游标分页逐批扫描全量 AI 消息] → 按天/周切分区间多次执行,`EXTRACTION_BATCH_SIZE` 可调;任务有执行记录可断点续跑。
- [拆行后行数增长:搜索频繁的应用行数约为原来的 2~4 倍] → 现有索引(call_timestamp 前缀组合索引)不变;`model_category` 索引已存在,筛选查询可直接命中。

## Migration Plan

1. **部署新抽取代码**(先行):日常任务即开始产生向量/重排行;查询层/前端随后或同版本发布均可(参数可选,向后兼容)。
2. **回填历史区间**(前置:TZ 定版 + Mongo 保留区间确认):
   - 用摸底 SQL 确认 Mongo 各区间搜索节点数据存在;
   - 通过任务管理页按区间手动执行 data-process(delete+re-extract;chat 行按幂等重建,结果不变);
   - 每个区间跑完执行对账 SQL:`SELECT model_category, COUNT(*) FROM model_call_logs WHERE call_timestamp BETWEEN ... GROUP BY 1`。
3. **回滚**:镜像回退即可;需清除新写入的拆分行时执行 `DELETE FROM model_call_logs WHERE call_id ~ ':(embedding|rerank|ext_llm|deep_llm)$'`(仅删子键行,chat 行不受影响);已回填数据无需清理(旧代码照常读取)。

## Open Questions

- 对外文档 `docs/external-statistics-api.md` 中 `total` 的分组键口径(上线评审 9.3-3 的 P1-1)与本 change 无耦合,维持既有待办,不在本 change 处理。
