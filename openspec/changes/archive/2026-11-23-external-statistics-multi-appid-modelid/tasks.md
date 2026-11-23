# Tasks

实现遵循项目工作模式「设计 → 测试示例 → 代码编写 → 测试运行 → 修正」，每个任务组自带测试，不集中到最后。

## 1. 校验层：多值解析与错误码（design D2/D4/D5/D6）

- [x] 1.1 `projects/admin/src/service/core/statistics/statistics.ts`：新增错误码 `INVALID_FILTER_PARAM = 'INVALID_FILTER_PARAM'`；`StatisticsQuery` 的 `appId`/`modelId` 类型改为 `string[]`。验证：文件改动完成后 `npx tsc --noEmit` 在 statistics.ts 无报错（queryBuilder 引用处的类型报错由 2.1 处理）
- [x] 1.2 先写测试示例：`validation.test.ts` 新增多值用例——单值归一化为数组、逗号分隔、重复参数（数组输入）、混合语法、去重保持顺序、空字符串视同未传、空白取值（`a,,b` 与纯空白）报 `INVALID_FILTER_PARAM`、超 50 报错、恰好 50 通过；同时更新既有空白值用例的错误码断言（INVALID_TIME_RANGE → INVALID_FILTER_PARAM，消息文本不变）。验证：用例就绪且与 design.md D4 规则一一对应
- [x] 1.3 实现 `validation.ts` 多值解析：解析 `string | string[]` → `string[]`（逗号分割/逐项/混合合并）、逐项 trim、空白取值抛 `INVALID_FILTER_PARAM`、去重保持首次出现顺序、`MAX_ID_FILTER_VALUES = 50` 导出常量并校验上限。验证：`pnpm test validation` 全绿
- [x] 1.4 排查 `StatisticsQuery.appId/modelId` 的其他消费方（statisticsService、by-app/by-model/overview/trend/status/export 路由）是否有依赖 string 类型的代码，一并修正类型。验证：`npx tsc --noEmit`（admin 项目）仅剩 queryBuilder 待改项或零报错

## 2. 查询构建层：多值 SQL（design D3）

- [x] 2.1 先写测试示例：`queryBuilder.test.ts` 新增用例——`buildAppFilter`/`buildModelIdFilter` 传入数组生成 `app_id = ANY($n)` / `model_id = ANY($n)` 与数组参数值；多值与其他条件（appName/modelName/callStatus）组合时参数序号连续（每条件仍占 1 个序号）；更新既有单值用例为归一化数组输入。验证：用例就绪
- [x] 2.2 实现 `queryBuilder.ts`：`buildAppFilter`/`buildModelIdFilter` 接收 `string[]`，生成 `= ANY($n)`，`values = [ids]`。验证：`pnpm test queryBuilder` 全绿
- [x] 2.3 更新 `integration.test.ts`：appId 多值 + modelId 多值 + appName/modelName 组合生成正确 SQL 与参数（参数序号、LIMIT/OFFSET 位置）。验证：`pnpm test integration` 全绿

## 3. API 路由层：参数类型与对外行为（design D7 + external spec 场景）

- [x] 3.1 更新 8 个路由文件的 QueryParams 类型：`projects/admin/src/pages/api/external/statistics/list.ts` 与 `projects/admin/src/pages/api/statistics/{list,by-app,by-model,overview,trend,status,export}.ts` 中 `appId`/`modelId` 改为 `string | string[]`。验证：`npx tsc --noEmit`（admin 项目）零报错（注：仅剩 list.test.ts 的辅助函数类型不兼容，由 3.2 处理；overview.ts middleware 错误为预存问题）
- [x] 3.2 先写测试示例：`external/statistics/__tests__/list.test.ts` 新增场景——多值 `appId=A,B` 返回 200 且日志/查询参数为数组、重复参数多值、空白取值返回 400 `INVALID_FILTER_PARAM`、超限返回 400、单值请求行为与既有断言完全一致。验证：用例就绪
- [x] 3.3 确认 external list 路由无需逻辑改动（校验委托 `validateAndCleanQuery`，日志字段输出数组即可），如有类型/日志断言需调整则修正。验证：`pnpm test list.test` 全绿

## 4. 全量验证与文档

- [x] 4.1 运行统计模块全量测试（validation、queryBuilder、integration、statistics 各路由、external list）确认零回归。验证：`pnpm test` 相关套件全绿，输出无失败用例
- [x] 4.2 更新对外接口文档中 appId/modelId 参数说明（多值语法、OR 语义、上限 50、逗号为分隔符的说明）。验证：文档位置交付且与 spec 场景一致
- [x] 4.3 对照 spec delta 逐条核对场景覆盖（外部 spec 7 个新场景 + filters spec 5 个新场景均有对应测试或明确说明）。验证：核对清单在变更说明中列出

## Workflow follow-up

- 实现完成后运行 `openspec verify external-statistics-multi-appid-modelid` 核对实现与工件一致性。
- 按项目评审要求完成审查后执行 `openspec archive external-statistics-multi-appid-modelid` 归档，同步 delta 到主规格。
