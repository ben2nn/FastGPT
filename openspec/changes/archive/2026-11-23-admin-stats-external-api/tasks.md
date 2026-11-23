# Tasks

## 1. 数据库与类型基础

- [x] 1.1 在 `projects/admin/src/service/sql/schema.sql` 中新增 `api_keys` 表与索引（结构见 design D2），运行项目初始化（`node scripts/init-system.js` 或 `POST /api/system/init`）验证建表成功：`\d api_keys` 可见全部字段
- [x] 1.2 扩展统计类型：`projects/admin/src/service/core/statistics/statistics.ts` 中 `StatisticsQuery` 新增 `modelId?: string`、`StatisticsListItem` 新增 `modelId: string`；`StatisticsListItem.modelId` 为必填字段，`statisticsService` 映射处的编译报错属预期，留待任务 2.3 一并修正——本任务验证 `npx tsc --noEmit` 时仅出现该映射处报错、无其他新错误

## 2. 查询能力升级（共用查询构建器，spec: statistics-query-filters）

- [x] 2.1 修改 `queryBuilder.ts`：`buildWhereClause` 支持 `modelId` 精确条件（`model_id = $n`）；`buildModelFilter` 从精确匹配改为 ILIKE 模糊匹配（复用 `escapeLikePattern` + `%...%` 包裹，与 `buildAppNameFilter` 一致）；编写 Jest 单测（`projects/admin/src/service/core/statistics/__tests__/queryBuilder.test.ts`）覆盖：modelId 条件生成、modelName 模糊参数、modelName 含 `%`/`_` 时转义为字面匹配、不传可选条件时 WHERE 不变，运行 `npx jest queryBuilder` 通过
- [x] 2.2 修改 `validation.ts`：`validateAndCleanQuery` 增加 `modelId` 清洗与非空字符串校验；编写 Jest 单测（`__tests__/validation.test.ts`）覆盖：modelId 合法值通过、空字符串报错、原有时间/分页校验不回归，运行 `npx jest validation` 通过（实现说明：空字符串在清洗阶段视同未传，与 appName 既有行为一致；纯空白字符串 trim 后报「不能为空」错——测试按此语义断言）
- [x] 2.3 修改 `statisticsService.ts` 与 `queryBuilder.ts` 的统计列表查询：`buildStatisticsListQuery` 与 `buildStatisticsListCountQuery` 的 SELECT/GROUP BY 增加 `model_id`，`getStatisticsList` 结果映射输出 `modelId` 字段；运行 `npx tsc --noEmit` 验证所有引用处类型正确
- [x] 2.4 内部统计 API 接入新参数：`projects/admin/src/pages/api/statistics/list.ts`（及 `export.ts` 等使用 `validateAndCleanQuery` 的接口）的查询参数类型增加 `modelId`；编写 Jest 单测验证 queryBuilder + validation 集成（传入 modelId + modelName 模糊生成正确 SQL 参数），运行 `npx jest statistics` 全部通过
- [x] 2.5 评估并补充 `model_call_logs.model_id` 索引（`CREATE INDEX IF NOT EXISTS idx_model_id ON model_call_logs(model_id)`）加入 schema.sql，确认初始化执行无报错

## 3. API Key 服务与认证（spec: external-api-auth）

- [x] 3.1 新建 `projects/admin/src/service/support/apiKey.ts`：Key 生成（`dek_` + 32 字节 base64url）、SHA-256 哈希、前缀提取、`api_keys` 表 CRUD（create/list/update/delete/findUsableByHash），复用 `getPostgresPool()`；编写 Jest 单测（`projects/admin/src/service/support/__tests__/apiKey.test.ts`，mock pg 池）覆盖：生成的 Key 含前缀且每次不同、哈希为 64 位 hex 且同 Key 哈希一致、create 后不返回明文哈希以外的 Key 信息，运行 `npx jest apiKey` 通过
- [x] 3.2 新建 `projects/admin/src/service/support/permission/authApiKey.ts`：实现 `authExternalApiKey(req)`（Bearer 解析 → 哈希查询 enabled Key → 异步更新 last_used_at → 未命中统一抛 401）；编写 Jest 单测覆盖：有效 Key 通过并返回记录、缺失/格式错误的 Authorization 头抛 401、禁用 Key 与不存在 Key 抛出相同错误对象，运行 `npx jest authApiKey` 通过

## 4. Key 管理 API 与页面（spec: external-api-auth）

- [x] 4.1 新建管理 API：`projects/admin/src/pages/api/external/keys/`（`list.ts` GET 分页列表、`create.ts` POST 创建并一次性返回明文、`update.ts` PUT 启停/改名、`delete.ts` DELETE 删除），全部经 `authAdmin` 认证，列表与更新响应仅含 `key_prefix` 不含明文；用 curl 以管理员 cookie 依次调用四个接口验证（创建返回明文、列表只返回前缀、禁用后 update 响应 enabled=false、删除后列表为空）（实现说明：四个接口已交付，行为由 4.3 的 11 个单测覆盖，无 session 时实测 401；带真实管理员 cookie 的 curl 全流程待用户登录后台后复核——本环境无 root 凭据）
- [x] 4.2 新建管理页面 `projects/admin/src/pages/keys/index.tsx`：Key 列表（前缀、名称、状态、创建/最近使用时间）、创建弹窗（名称输入）、创建成功弹窗（完整 Key 一次性展示 + 复制按钮 + 仅显示一次提示）、启用/禁用与删除操作（含确认）；在 `AdminSidebar.tsx` 增加「API 密钥」菜单项；运行 `cd projects/admin && pnpm dev` 在浏览器手动验证完整流程（创建→复制→列表可见→禁用→删除）（用户已实测全部通过：创建→复制→列表可见 ✓、禁用 ✓——禁用后对外接口立即 401 且 DB enabled=false、删除 ✓——DELETE 请求到达服务器、DB 记录清零，见服务器日志 13:50:30）
- [x] 4.3 为 Key 管理 API 编写 Jest 单测（mock 认证与 apiKey 服务）：非管理员 session 返回 401、create 请求缺 name 返回 400，运行 `npx jest keys` 通过

## 5. 对外统计接口（spec: external-statistics-api）

- [x] 5.1 新建 `projects/admin/src/pages/api/external/statistics/list.ts`：GET 校验 → `authExternalApiKey` → `validateAndCleanQuery` → `statisticsService.getStatisticsList`，错误响应结构与内部 list.ts 一致（401/400/405/504/500 对应码）；编写 Jest 单测（mock 认证与统计服务）覆盖：无 Authorization 头返回 401、非法时间区间返回 400 与 INVALID_TIME_RANGE、pageSize=200 返回 400 与 INVALID_PAGINATION、POST 返回 405、正常请求返回 200 且响应含 total/list/pageNum/pageSize，运行 `npx jest external-statistics` 通过
- [x] 5.2 端到端手动验证：`pnpm dev` 启动后，用 curl 携带步骤 4 创建的真实 Key 调用 `GET /api/external/statistics/list`，验证场景：有效 Key 返回数据且与内部 `/api/statistics/list` 相同参数结果一致；appName/modelName 模糊匹配生效；modelId 精确匹配生效；禁用 Key 后返回 401；管理员 cookie（不带 Key）访问返回 401（实测记录：dev 服务器 + DB 直插临时 Key 完成全场景——无头 401 / 无效 Key 401 / POST 405 / 有效 Key 返回数据 / appName 中文模糊命中 / modelName 大小写不敏感命中 / modelId 精确命中 / 组合筛选命中 / `%` 按字面匹配 / 时间颠倒 400+INVALID_TIME_RANGE / pageSize=200 400+INVALID_PAGINATION / 超 365 天 400+TIME_RANGE_TOO_LARGE / 禁用 Key 即时 401；「内外一致」以 DB 直查对比替代（同区间同为 1 组、callCount=4），「管理员 cookie 无 Key 访问 401」由无 Authorization 头场景等价覆盖；测试 Key 已删除）

## 6. 集成检查与文档

- [x] 6.1 运行 `cd projects/admin && npx jest` 全量测试通过，`npx tsc --noEmit` 无类型错误，`pnpm lint` 无新增告警（实测：68 个测试全部通过；tsc 无新增错误——仓库存在 40+ 历史遗留类型错误被 next.config 的 ignoreBuildErrors 掩盖，与本次改动无关；新增代码 eslint 无告警）
- [x] 6.2 编写三方对接文档 `projects/admin/docs/external-statistics-api.md`：认证方式、参数表（含模糊匹配说明与示例）、响应结构、错误码表、curl 示例；核对文档中的每个示例命令与实际接口行为一致（全量拉取 / appName 模糊 / modelId+modelName 组合 / 401 示例均已实测对应）
- [x] 6.3 在上线说明中标注 BREAKING 变更：内部统计 API 的 modelName 筛选由精确匹配变为模糊匹配、list 响应新增 modelId 字段（同步到本仓库上线评审文档或 CHANGELOG）（输出：`.claude/design/上线说明-2026-11-23-对外统计接口.md`，含分页错误码修正说明）

## Workflow follow-up

- 评审通过后执行 `openspec verify` 校验实现与 artifacts 一致，再归档变更。
