# FastGPT Admin 管理后台界面需求提炼

> 提炼日期：2026-11-19
> 提炼来源：`projects/admin` 实际代码、`.claude/design` 下 admin 相关设计文档、`.claude/design/上线前评审-2026-11-19.md`
> 本文是**需求基线与待确认清单**，不是实施方案；标注「现状」的内容来自代码核查，标注「待确认」的内容需业务方决策后才能进入开发。

## 1. 范围与概念边界

本仓库存在多个「admin」概念，本文仅针对**独立超管后台 `projects/admin`**。

| 概念 | 载体 | 鉴权 | 范围 | 是否本文范围 |
| --- | --- | --- | --- | --- |
| 超管后台 | `projects/admin`（品牌文案「DejaxAI管理后台」） | `authAdmin()` 要求 `isRoot`，Cookie `fastgpt_token` | 跨全部团队的用户、团队、知识库、应用、统计、任务、导入导出 | 是 |
| 团队空间管理 | `projects/app/src/pages/account/team/index.tsx` | `TeamPermission.hasManagePer`、owner 角色 | 单团队内成员/组织/权限组/审计 | 否 |
| root 系统配置 | `projects/app/src/pages/config/tool/*` | `userInfo.username === 'root'` | 系统工具/插件配置 | 否 |
| 运维型 admin API | `projects/app/src/pages/api/admin/*`（`initv*` 等） | 迁移脚本 | DB 升级、备案等 | 否 |

## 2. 用户与权限需求

- **FR-P1 管理员身份**：后台只面向超级管理员；服务端统一由 `authAdmin()` 校验 `isRoot`，前端由 `ProtectedRoute` 做路由守卫。现有实现中 `isRoot` 由登录用户名是否为 `root` 决定（`projects/admin/src/pages/api/auth/login.ts`）。
- **FR-P2 数据视角**：管理员视角为**全局视角**，不按团队隔离；已有设计文档明确「Admin 拥有全部权限，不需要协作者权限」（`.claude/design/admin-dataset-management.md`）。
- **FR-P3 菜单可见性**：侧边栏为硬编码数组（`projects/admin/src/web/context/Layout/AdminSidebar.tsx`），无按角色动态配置需求。
- **待确认 P-1**：用户管理、团队管理页面已实现但菜单项被注释（同文件 L40-55），需要决定「恢复入口」还是「下线页面」。

## 3. 信息架构现状

| 菜单 | 路由 | 状态 |
| --- | --- | --- |
| 首页 | `/dashboard` | 已开放 |
| 数据统计 | `/statistics` | 已开放 |
| 任务管理 | `/tasks` | 已开放 |
| 用户管理 | `/user/list` | 页面已实现，**菜单被注释** |
| 团队管理 | `/team/list` | 页面已实现，**菜单被注释** |
| 知识库 | `/dataset/list` | 已开放 |
| 备份还原 | `/import-export` | 已开放 |

除登录页外，所有业务页均使用 `ProtectedRoute` + `Layout` 包裹。

## 4. 功能需求清单

### FR-01 登录与会话

- 登录方式：用户名 + 密码（前端 SHA256 后提交），仅此一种；无注册、短信、OAuth。
- 接口：`POST /api/auth/login` 写 `fastgpt_token` Cookie；`/api/auth/verify` 用于 SSR 校验；`/api/auth/logout` 退出。
- 跳转：已登录访问登录页应重定向 `/dashboard`；未登录访问业务页应回登录页。
- 现状：完整可用（`projects/admin/src/pages/login/index.tsx`、`projects/admin/src/web/context/AuthContext.tsx`）。

### FR-02 首页看板

- 指标卡：总调用次数、总 Token 数、调用成功率、平均 Token 数、总耗时、平均耗时。
- 图表：调用趋势、状态分布、应用排行、模型分布。
- 筛选：今天 / 最近 7 天 / 最近 30 天快捷时间范围。
- 现状与缺口：
  - 页面已定义 `autoRefresh` / `refreshInterval` 与定时器，但 `FilterDatePanel` 未提供开关入口，自动刷新实际不可用。
  - 存在调试用 `console.log` 残留（`FilterDatePanel.tsx`、`OverviewCards.tsx`）。
- 待确认 P-2：自动刷新是「补齐 UI」还是「删除死代码」。

### FR-03 数据统计

- 筛选：开始/结束时间、应用名称、模型名称、调用状态（常量与状态已定义，但界面未渲染状态下拉）、查询/重置、导出。
- 列表字段：智能体、模型、使用场景、调用次数、总 Tokens、总耗时、平均耗时、调用成功率、平均 Tokens 数；每页 20 条，上一页/下一页。
- 导出：前端分页拉全量（pageSize=100）后生成带 BOM 的 CSV，文件名 `statistics-list-*.csv`；页面未使用服务端 `/api/statistics/export`。
- 现状与缺口（上线前评审标记为 P0/P1）：
  - 统计时基依赖容器 `TZ`，而数据库列为无时区 `TIMESTAMP`，查询参数统一按 `+08:00` 归一化；容器 TZ 非 `Asia/Shanghai` 时统计区间静默错位。
  - 总数查询分组键（app_id + model_name）与列表分组键（app_id + app_name + model_name + usage_scenario）不一致，导致 `total` 偏小、导出静默缺行。
  - 前端导出列已删除「总积分消耗」，服务端 `/api/statistics/export` 仍返回该列，两套导出格式分叉。
- 待确认 P-3：是否将「状态筛选」「服务端导出接口对齐」「时区修正」纳入本期范围。

### FR-04 任务管理

- 列表：任务名称、描述、Cron、状态、最近执行、下次执行、启用开关；操作为详情、执行历史、立即执行（带 JSON 参数）；支持刷新。
- 详情：只读展示任务 ID、时区、执行器、最大执行时间、重试次数/间隔等；支持校验并修改 Cron、描述、默认参数。
- 历史：按状态（全部/成功/失败/运行中）筛选、分页，展开查看参数/结果/错误信息；含执行统计图表。
- 能力边界：可启停、手动执行、改 Cron/描述/参数、看历史；**不可新增/删除任务，不可改时区/执行器/重试策略**；任务本体由服务端 `TaskManager` 初始化。
- 现状与缺口：`/update-params` 与 `/reinitialize` 接口已封装但 UI 未暴露（后者弹窗内有函数无按钮）。
- 待确认 P-4：是否需要「新增/删除任务」以及是否暴露 `update-params` / `reinitialize`。

### FR-05 用户管理（入口隐藏）

- 能力：用户名模糊搜索、新增用户、编辑、改密码（新密码 + 确认，至少 4 位）、删除；列表展示头像/用户名、状态、余额、分成比例、时区。
- 约束：`root` 用户不展示删除按钮。
- 接口：`GET/POST /api/extend/user`、`PUT/DELETE /api/extend/user/{id}`。
- 现状：页面完整，侧边栏入口被注释；`getServerSideProps` 从未调用 `serviceSideProps`（i18n 基础设施缺失，见 NFR-02）。

### FR-06 团队管理（入口隐藏）

- 能力：左右双栏；团队新建/编辑/删除、成员搜索、添加/移除成员、更换所有者（二次确认）。
- 列表字段：团队名称、所有者；成员的用户、角色（所有者/成员）、状态、余额、分成比例、时区。
- 约束：root 团队禁止删除；删除团队前必须先清空成员；root/owner 不可移除。
- 接口：`/api/extend/team` GET/POST、`/api/extend/team/{id}` PUT/DELETE、`/api/extend/team/{id}/members` GET/POST/DELETE。
- 现状：页面完整，侧边栏入口被注释。

### FR-07 知识库管理

- 列表：树形文件夹 + 面包屑，名称搜索（300ms 防抖），卡片展示头像、名称、简介、所有者、私有/权限标识、向量模型、类型标签。
- 操作：新建普通/网站/API/飞书/语雀知识库及文件夹（受 `feConfigs.show_dataset_feishu/yuque` 与创建权限控制）、打开/详情、拖拽移动、编辑信息、协作者与权限配置、导出 CSV、删除。
- 详情 Tab：数据、集合、索引增强、搜索测试、信息配置；另有导入 Tab 仅能通过 `?currentTab=import` 直达（NavBar 未列出）。
- 接口：`/core/dataset/list|detail|paths|create|update|delete|resumeInheritPermission` 及 collection/data/collaborator 系列接口。
- 现状与设计偏差：`.claude/design/admin-dataset-management.md` 定义的第一期为「只读列表 + 搜索 + 删除 + 详情」，实际代码已实现完整 CRUD 与权限管理；需要以代码为准更新需求基线。
- 待确认 P-5：导入 Tab 是否补到 NavBar；需求基线以设计文档还是以现有实现为准。

### FR-08 备份还原（导入导出）

- 对象范围：知识库、工作流、工具、模型配置、渠道，共 5 类，每类为「导出卡片 + 导入卡片」。
- 选项：对象树选择、模型提供商与模型类型（llm/embedding/tts/stt/rerank）、目标位置、保留原 ID、导出源文件、忽略源文件、重建索引。
- 约束：文件不超过 500MB；知识库接受 `.json/.zip`，其余为 `.json`。
- 接口：`/api/extend/{dataset,app,tool,model,channel}` 的 `export*`/`import*` 系列。
- 现状与缺口：渠道 Tab 配置了 `showKeepOriginalId: true` 但 UI 未渲染开关；知识库导出分支读取 `provider`/`modelType` 后未使用。
- 待确认 P-6：上述选项是否属于必须暴露给管理员的能力。

## 5. 非功能需求

- **NFR-01 安全**：所有统计/管理接口必须经 `authAdmin()`；用户名由 `root` 判定管理员的做法需评估是否改为显式角色字段；统计接口的 `appName` 模糊查询已参数化并转义，保持该约束。
- **NFR-02 国际化**：`projects/admin/next.config.js` 未接入 i18n 配置，`serviceSideProps` 从未在页面调用，72 个 TSX 约 1292 处硬编码中文；详见 `.claude/design/admin-i18n-fix-plan.md`。待确认 P-7：本期是否纳入 i18n 修复，或明确 admin 仅中文。
- **NFR-03 时区一致性**：统计写入/查询/展示必须统一业务时区；上线前须确认容器 `TZ=Asia/Shanghai`，长期方案见 `.claude/design/admin-statistics-timezone-fix.md`。
- **NFR-04 质量闸门**：`next.config.js` 开启 `ignoreBuildErrors`，约 43 个既有 TS 错误；`projects/admin` 下无任何测试文件，统计模块零单测。建议至少为 `validation.ts` / `queryBuilder.ts` 补回归测试，并逐步关闭 `ignoreBuildErrors`。
- **NFR-05 数据一致性**：列表 `total`、分页、CSV 导出必须基于同一分组口径与列结构；避免导出静默缺行或列错位。
- **NFR-06 日志与调试**：上线前清理 `console.log` 残留，禁止在控制台打印查询条件。

## 6. 验收要点（建议）

1. 非 root 账号无法登录/访问任何 admin 页面；未登录访问业务页跳转登录页。
2. 「今天 / 最近 7 天」统计结果与数据库按业务时区对账一致；`total` 与导出条数一致，CSV 列结构前后端一致。
3. 任务启停、手动执行、Cron 修改、历史查看均可用，禁用执行按钮状态正确。
4. 用户/团队管理入口状态经确认后，页面可正常完成 CRUD 且 root 保护规则生效。
5. 知识库列表、详情各 Tab、备份还原 5 类对象的导入导出均可完成；导入超限文件被拒绝并给出提示。
6. 无调试日志输出；若有 i18n 要求，语言切换后 admin 页面文案随之变化。

## 7. 待确认问题汇总

| 编号 | 问题 | 影响 |
| --- | --- | --- |
| P-1 | 用户管理/团队管理菜单是否恢复？ | 决定两个已实现页面的交付状态 |
| P-2 | 首页自动刷新补齐 UI 还是移除代码？ | 看板交互口径 |
| P-3 | 状态筛选、服务端导出对齐、时区修正是否纳入本期？ | 数据统计可用性与发布风险 |
| P-4 | 任务是否支持新增/删除，`update-params`/`reinitialize` 是否暴露？ | 任务管理边界 |
| P-5 | 知识库需求以设计文档（只读）还是现有实现（全 CRUD）为准？导入 Tab 是否补入口？ | 需求基线 |
| P-6 | 备份还原中「保留原 ID」「provider/modelType」等选项是否必须可用？ | 导入导出完整性 |
| P-7 | admin 是否需要多语言？ | 决定是否启动 i18n 修复（约 1292 处文案） |
| P-8 | 品牌文案「DejaxAI管理后台」是否为最终名称？ | 展示层 |

## 8. 主要依据文件

- `projects/admin/src/web/context/Layout/AdminSidebar.tsx`（菜单与品牌）
- `projects/admin/src/service/support/permission/auth.ts`、`projects/admin/src/pages/api/auth/*`（鉴权）
- `projects/admin/src/pages/{dashboard,statistics,tasks,user/list,team/list,dataset/list,dataset/detail,import-export}/`（页面）
- `projects/admin/src/pageComponents/{statistics,tasks,dataset}/`（交互组件）
- `projects/admin/src/web/core/{statistics,task,dataset,extend}/api.ts`（接口封装）
- `.claude/design/admin-dataset-management.md`、`admin-i18n-fix-plan.md`、`admin-statistics-timezone-fix.md`
- `.claude/design/上线前评审-2026-11-19.md`（P0/P1 风险与待验证项）
