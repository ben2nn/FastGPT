# statistics-query-filters Specification

## Purpose

定义内部统计 API 与对外统计接口共用的查询筛选行为：新增模型ID精确筛选，模型名称与应用名称统一为模糊匹配，确保内外接口查询行为一致。

## Requirements

### Requirement: 模型ID筛选
统计查询 SHALL 支持可选的 `modelId` 精确筛选条件（匹配 `model_call_logs.model_id`），并支持单请求传入多个模型ID（逗号分隔或重复参数，命中任一即返回，数量上限 50）。内部统计 API（list、export）与对外统计接口共用该行为。

#### Scenario: 内部统计列表按模型ID筛选
- **WHEN** 管理员在内部统计列表 API 传入 `modelId=<具体模型ID>`
- **THEN** 返回结果仅包含该模型的统计数据

#### Scenario: 内部统计列表按多个模型ID筛选（逗号分隔）
- **WHEN** 管理员在内部统计列表 API 传入 `modelId=gpt-4o,gpt-4o-mini`
- **THEN** 返回结果包含这两个模型的统计数据，其他模型不返回

#### Scenario: 内部统计列表按多个模型ID筛选（重复参数）
- **WHEN** 管理员以重复参数方式传入 `modelId=gpt-4o&modelId=gpt-4o-mini`
- **THEN** 返回结果包含这两个模型的统计数据，其他模型不返回

#### Scenario: 多值取值为空白或超过上限被拒绝
- **WHEN** 管理员传入 `modelId=gpt-4o,,gpt-4o-mini`（含空白取值）或取值数量超过 50 个
- **THEN** 接口返回 400 与错误码 INVALID_FILTER_PARAM

#### Scenario: 不传 modelId 时行为不变
- **WHEN** 请求未携带 `modelId` 参数
- **THEN** 查询结果不按模型ID过滤，与升级前的行为一致

### Requirement: 模型名称模糊匹配
统计查询的 `modelName` 筛选 SHALL 为模糊匹配（不区分大小写的包含匹配）。内部统计 API 与对外统计接口共用该行为（**BREAKING**：内部 API 的 modelName 由精确匹配变为模糊匹配）。

#### Scenario: 内部统计列表按模型名称模糊筛选
- **WHEN** 管理员在内部统计列表 API 传入 `modelName=GPT-4`，数据库中存在模型名称「gpt-4o」「GPT-4-turbo」
- **THEN** 返回结果同时包含这两个模型的统计数据

#### Scenario: 导出接口沿用模糊匹配
- **WHEN** 管理员使用内部导出 API 并传入 modelName 筛选
- **THEN** 导出数据按模糊匹配结果导出，与列表查询一致

### Requirement: 内外查询行为一致
对外统计接口与内部统计列表 API SHALL 共用同一套查询构建与参数校验逻辑，对相同参数返回相同的筛选结果与分页行为；appId 与 modelId 的多值筛选行为（传参语法、OR 语义、数量上限）在两个接口同等生效；内部 API 已有的校验规则（时间区间、分页上限、通配符转义、多值校验）对两个接口同等生效。

#### Scenario: 相同参数内外结果一致
- **WHEN** 同一请求参数分别通过内部统计列表 API（管理员认证）与对外统计接口（API Key 认证）调用
- **THEN** 两者返回的统计列表数据（total 与 list 内容）一致

#### Scenario: 多值筛选内外一致
- **WHEN** 同一多值参数（如 `appId=A,B` 与 `modelId=X,Y`）分别通过内部统计列表 API 与对外统计接口调用
- **THEN** 两者返回的统计列表数据一致，均按「参数内 OR、参数间 AND」语义筛选

#### Scenario: 多值校验规则内外一致
- **WHEN** 任一接口收到空白取值或超过数量上限的多值 ID 参数
- **THEN** 两个接口返回相同的 400 错误码（INVALID_FILTER_PARAM）与错误结构
