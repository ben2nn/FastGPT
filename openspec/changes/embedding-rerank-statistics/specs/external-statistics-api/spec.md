# Spec Delta

## MODIFIED Requirements

### Requirement: 对外统计列表接口
系统 SHALL 暴露 `GET /api/external/statistics/list` 接口,仅接受 API Key 认证(不接受内部管理员 session)。接口 SHALL 返回按「应用 + 模型 + 模型类别 + 使用场景」分组的统计列表(响应中的 `total` 为该分组组合数,与列表分组一致),每条记录包含:应用ID、应用名称、模型ID、模型名称、模型类别、使用场景、调用次数、总 tokens、总积分消耗、总耗时、平均耗时、成功率、平均每次调用 tokens。模型类别(`modelCategory`)取值为 `chat`(对话模型)、`embedding`(向量模型)、`rerank`(重排模型),向量与重排等模型的调用记录与对话模型记录同列表返回。

#### Scenario: 三方成功拉取统计数据
- **WHEN** 三方携带有效 API Key 以 GET 请求调用接口并传入合法的时间区间
- **THEN** 接口返回 200 与统计列表数据,结构包含 total、list、pageNum、pageSize

#### Scenario: 使用管理员 session 访问被拒绝
- **WHEN** 请求仅携带内部管理员 session(cookie/token header)而不携带 API Key
- **THEN** 接口返回 401,拒绝访问

#### Scenario: 向量与重排记录出现在统计列表
- **WHEN** 统计区间内发生了启用重排的知识库搜索调用
- **THEN** 返回列表中同时包含该搜索对应的向量模型记录(modelCategory=embedding)与重排模型记录(modelCategory=rerank),每条记录均携带 modelCategory 字段

## ADDED Requirements

### Requirement: 模型类别查询参数
对外统计接口 SHALL 支持可选的 `modelCategory` 查询参数,取值枚举 `chat`、`embedding`、`rerank`;支持逗号分隔或重复参数的多值语法,参数内多值为 OR 语义(命中任一类别即返回),每参数取值数量上限 50。不传该参数时返回全部类别的数据。空白取值、数量超限或取值不在枚举内时 SHALL 返回 400 与错误码 `INVALID_FILTER_PARAM`。该参数可与时间区间、appId、appName、modelId、modelName 等既有条件组合使用,过滤语义与内部统计 API 一致。

#### Scenario: 按模型类别筛选
- **WHEN** 三方传入 `modelCategory=embedding`
- **THEN** 返回结果仅包含向量模型的统计数据

#### Scenario: 多类别逗号分隔筛选
- **WHEN** 三方传入 `modelCategory=chat,embedding`
- **THEN** 返回结果包含对话与向量两个类别的统计数据,重排类别不返回

#### Scenario: 重复参数多类别筛选
- **WHEN** 三方以重复参数方式传入 `modelCategory=rerank&modelCategory=embedding`
- **THEN** 返回结果包含重排与向量两个类别的统计数据

#### Scenario: 非法类别值被拒绝
- **WHEN** 三方传入 `modelCategory=voice`
- **THEN** 接口返回 400 与错误码 INVALID_FILTER_PARAM

#### Scenario: 空白取值被拒绝
- **WHEN** 三方传入 `modelCategory=chat,,embedding`
- **THEN** 接口返回 400 与错误码 INVALID_FILTER_PARAM

#### Scenario: 与其他筛选条件组合
- **WHEN** 三方同时传入 `modelCategory=rerank`、时间区间与 `appName=客服`
- **THEN** 返回结果仅包含应用名称含「客服」的重排模型统计数据
