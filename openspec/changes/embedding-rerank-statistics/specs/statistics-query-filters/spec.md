# Spec Delta

## ADDED Requirements

### Requirement: 模型类别筛选
统计查询 SHALL 支持可选的 `modelCategory` 筛选条件,匹配 `model_call_logs.model_category`,取值枚举 `chat`(对话)、`embedding`(向量)、`rerank`(重排);支持单请求传入多个类别(逗号分隔或重复参数,命中任一类别即返回,数量上限 50,参数内多值为 OR 语义)。内部统计 API(全部统计端点与导出)与对外统计接口 SHALL 共用该行为:相同的参数在两个接口产生相同的过滤结果。不传该参数时不按类别过滤;取值空白、数量超限或取值不在枚举内时 SHALL 返回 400 与错误码 `INVALID_FILTER_PARAM`。

#### Scenario: 内部统计按单个类别筛选
- **WHEN** 管理员在内部统计列表 API 传入 `modelCategory=embedding`
- **THEN** 返回结果仅包含向量模型的统计数据

#### Scenario: 逗号分隔的多类别筛选
- **WHEN** 管理员传入 `modelCategory=chat,embedding`
- **THEN** 返回结果包含对话与向量两个类别的统计数据,重排类别不返回

#### Scenario: 重复参数的多类别筛选
- **WHEN** 管理员以重复参数方式传入 `modelCategory=rerank&modelCategory=embedding`
- **THEN** 返回结果包含重排与向量两个类别的统计数据

#### Scenario: 取值带首尾空白按 trim 后枚举校验
- **WHEN** 管理员传入 `modelCategory= chat , rerank `
- **THEN** 每个取值先去除首尾空白再按枚举匹配,返回对话与重排两个类别的统计数据

#### Scenario: 非法类别值被拒绝
- **WHEN** 任一接口传入 `modelCategory=voice`
- **THEN** 接口返回 400 与错误码 INVALID_FILTER_PARAM,提示类别取值非法

#### Scenario: 空白取值被拒绝
- **WHEN** 任一接口传入 `modelCategory=chat,,rerank` 或 `modelCategory=%20%20`
- **THEN** 接口返回 400 与错误码 INVALID_FILTER_PARAM,提示取值不能为空白

#### Scenario: 取值数量超上限被拒绝
- **WHEN** 任一接口传入的 modelCategory 取值数量超过 50 个
- **THEN** 接口返回 400 与错误码 INVALID_FILTER_PARAM,提示取值数量超限

#### Scenario: 不传类别时行为不变
- **WHEN** 请求未携带 `modelCategory` 参数
- **THEN** 查询结果包含全部类别的数据,与升级前行为一致

#### Scenario: 类别筛选与其他条件组合
- **WHEN** 管理员同时传入 `modelCategory=rerank` 与时间区间、appName 筛选
- **THEN** 返回结果仅包含同时满足全部条件的数据

#### Scenario: 类别筛选内外一致
- **WHEN** 同一 `modelCategory` 参数(含多值语法)分别通过内部统计列表 API 与对外统计接口调用
- **THEN** 两者返回的统计列表数据(total 与 list 内容)一致
