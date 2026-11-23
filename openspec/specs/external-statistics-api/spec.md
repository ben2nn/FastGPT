# external-statistics-api Specification

## Purpose

提供三方系统通过 API Key 授权拉取统计数据的外部接口：按「应用 + 模型」分组返回统计列表，支持应用ID、应用名称、模型ID、模型名称、统计时间区间等查询条件，其中名称类条件支持模糊匹配。

## Requirements

### Requirement: 对外统计列表接口
系统 SHALL 暴露 `GET /api/external/statistics/list` 接口，仅接受 API Key 认证（不接受内部管理员 session）。接口 SHALL 返回按「应用 + 模型」分组的统计列表，每条记录包含：应用ID、应用名称、模型ID、模型名称、使用场景、调用次数、总 tokens、总积分消耗、总耗时、平均耗时、成功率、平均每次调用 tokens。

#### Scenario: 三方成功拉取统计数据
- **WHEN** 三方携带有效 API Key 以 GET 请求调用接口并传入合法的时间区间
- **THEN** 接口返回 200 与统计列表数据，结构包含 total、list、pageNum、pageSize

#### Scenario: 使用管理员 session 访问被拒绝
- **WHEN** 请求仅携带内部管理员 session（cookie/token header）而不携带 API Key
- **THEN** 接口返回 401，拒绝访问

### Requirement: 查询条件
接口 SHALL 支持以下查询参数：
- `startTime`、`endTime`（必填，ISO 8601 格式，构成统计时间区间，开始时间早于结束时间，区间不超过 365 天）
- `appId`（可选，精确匹配；支持单值或多值，多值以逗号分隔或重复参数传入，命中任一即返回）
- `appName`（可选，模糊匹配）
- `modelId`（可选，精确匹配；支持单值或多值，多值以逗号分隔或重复参数传入，命中任一即返回）
- `modelName`（可选，模糊匹配）
- `pageNum`（可选，正整数，默认 1）、`pageSize`（可选，1-100，默认 20）

`appId` 与 `modelId` 的多值规则：
- 同一参数的多个取值之间为 OR 语义（命中任一即返回）
- 每个取值独立 trim；取值为空白时返回 400（错误码 INVALID_FILTER_PARAM）
- 单个参数取值数量不超过 50，超过返回 400（错误码 INVALID_FILTER_PARAM）
- 参数值为空字符串时视同未传该参数（与既有行为一致）
- 单值传参的行为与扩展前完全一致

#### Scenario: 按应用ID筛选
- **WHEN** 三方传入 `appId=<具体应用ID>`
- **THEN** 返回结果仅包含该应用的统计数据

#### Scenario: 按应用名称模糊筛选
- **WHEN** 三方传入 `appName=客服`（部分名称片段）
- **THEN** 返回结果包含应用名称中含「客服」的所有应用（不区分大小写）的统计数据

#### Scenario: 按模型ID筛选
- **WHEN** 三方传入 `modelId=<具体模型ID>`
- **THEN** 返回结果仅包含该模型的统计数据

#### Scenario: 按模型名称模糊筛选
- **WHEN** 三方传入 `modelName=gpt`（部分名称片段）
- **THEN** 返回结果包含模型名称中含「gpt」的所有模型（不区分大小写）的统计数据

#### Scenario: 组合筛选
- **WHEN** 三方同时传入时间区间与多个筛选条件（如 appName + modelName）
- **THEN** 返回结果仅包含同时满足全部条件的数据

#### Scenario: 名称模糊匹配中的通配符按字面处理
- **WHEN** 三方在 appName 或 modelName 中传入 `%`、`_` 等数据库通配符字符
- **THEN** 这些字符按字面值匹配，不作为通配符解释

#### Scenario: 逗号分隔的多应用ID筛选
- **WHEN** 三方传入 `appId=<应用ID A>,<应用ID B>`
- **THEN** 返回结果仅包含应用 A 与应用 B 的统计数据，其他应用不返回

#### Scenario: 重复参数的多模型ID筛选
- **WHEN** 三方以重复参数方式传入 `modelId=<模型ID X>&modelId=<模型ID Y>`
- **THEN** 返回结果仅包含模型 X 与模型 Y 的统计数据，其他模型不返回

#### Scenario: 多值ID取值中的空白按字面值匹配
- **WHEN** 三方传入 `appId= abc , def `（取值带首尾空白）
- **THEN** 每个取值先去除首尾空白再精确匹配，返回应用「abc」与「def」的统计数据

#### Scenario: 多值与多值组合筛选
- **WHEN** 三方同时传入多值 `appId=A,B` 与多值 `modelId=X,Y`
- **THEN** 返回结果仅包含「应用 A 或 B」且「模型 X 或 Y」的统计数据（参数内 OR，参数间 AND）

#### Scenario: 多值ID含空白取值被拒绝
- **WHEN** 三方传入 `appId=A,,B` 或 `appId=%20%20`
- **THEN** 接口返回 400 与错误码 INVALID_FILTER_PARAM，提示 ID 取值不能为空白

#### Scenario: 多值数量超过上限被拒绝
- **WHEN** 三方传入的 appId（或 modelId）取值数量超过 50 个
- **THEN** 接口返回 400 与错误码 INVALID_FILTER_PARAM，提示取值数量超限

#### Scenario: 多值不影响分页与响应结构
- **WHEN** 三方传入多值 `appId=A,B` 并携带 pageNum/pageSize
- **THEN** 响应结构（total、list、pageNum、pageSize）与单值时一致，分页按筛选后的全部分组数据计算

### Requirement: 参数校验与错误响应
接口 SHALL 校验查询参数，对非法请求返回 4xx 状态码与结构化错误响应（code、message、details）：时间区间非法（开始晚于结束、超过 365 天、开始时间在未来）返回 400；分页参数越界返回 400；认证失败返回 401；查询超时返回 504。错误响应结构 MUST 与内部统计 API 一致。

#### Scenario: 时间区间非法
- **WHEN** 三方传入 startTime 晚于 endTime，或区间超过 365 天
- **THEN** 接口返回 400 与对应错误码（INVALID_TIME_RANGE 或 TIME_RANGE_TOO_LARGE）

#### Scenario: pageSize 超限
- **WHEN** 三方传入 `pageSize=200`
- **THEN** 接口返回 400 与错误码 INVALID_PAGINATION，提示 pageSize 不能超过 100

#### Scenario: 查询超时
- **WHEN** 统计查询执行超过服务端设定的超时时间
- **THEN** 接口返回 504 与错误码 QUERY_TIMEOUT，提示缩小时间范围或增加筛选条件

### Requirement: 对外接口安全约束
对外接口 MUST NOT 泄露内部实现细节：错误响应不包含 SQL、堆栈或数据库错误原文；所有筛选均使用参数化查询；接口仅提供只读查询能力（仅支持 GET）。

#### Scenario: 非只读请求被拒绝
- **WHEN** 三方以 POST/PUT/DELETE 方法调用对外统计接口
- **THEN** 接口返回 405 METHOD_NOT_ALLOWED

#### Scenario: 数据库错误不泄露内部信息
- **WHEN** 数据库查询发生内部错误
- **THEN** 接口返回 500 与通用错误消息（DATABASE_ERROR），响应中不包含 SQL 语句或数据库错误原文
