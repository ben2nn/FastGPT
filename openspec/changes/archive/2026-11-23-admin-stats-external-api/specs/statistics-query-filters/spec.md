# Spec Delta

## Purpose

定义内部统计 API 与对外统计接口共用的查询筛选行为：新增模型ID精确筛选，模型名称与应用名称统一为模糊匹配，确保内外接口查询行为一致。

## ADDED Requirements

### Requirement: 模型ID筛选
统计查询 SHALL 支持可选的 `modelId` 精确筛选条件（匹配 `model_call_logs.model_id`）。内部统计 API（list、export）与对外统计接口共用该行为。

#### Scenario: 内部统计列表按模型ID筛选
- **WHEN** 管理员在内部统计列表 API 传入 `modelId=<具体模型ID>`
- **THEN** 返回结果仅包含该模型的统计数据

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
对外统计接口与内部统计列表 API SHALL 共用同一套查询构建与参数校验逻辑，对相同参数返回相同的筛选结果与分页行为；内部 API 已有的校验规则（时间区间、分页上限、通配符转义）对两个接口同等生效。

#### Scenario: 相同参数内外结果一致
- **WHEN** 同一请求参数分别通过内部统计列表 API（管理员认证）与对外统计接口（API Key 认证）调用
- **THEN** 两者返回的统计列表数据（total 与 list 内容）一致
