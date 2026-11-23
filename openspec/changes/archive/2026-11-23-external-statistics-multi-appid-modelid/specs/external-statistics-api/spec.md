# Spec Delta

## MODIFIED Requirements

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
