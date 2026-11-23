# external-api-auth Specification

## Purpose

为三方系统提供独立的 API Key 授权体系：管理员可创建、启用、禁用、删除对外 Key，三方以 Bearer Token 方式访问对外接口，Key 仅以哈希存储且可追溯最近使用情况。

## Requirements

### Requirement: API Key 存储
系统 SHALL 使用 PostgreSQL 表 `api_keys` 存储对外授权 Key，每个 Key 记录 MUST 包含：唯一标识、Key 哈希（不存明文）、Key 前缀（用于展示识别）、名称/备注、启用状态、创建时间、更新时间、最近使用时间（可空）。

#### Scenario: Key 以哈希形式持久化
- **WHEN** 管理员创建一个新 Key
- **THEN** 数据库中只存在该 Key 的哈希值与 Key 前缀，任何表查询、日志、接口响应（创建响应除外）中都不出现 Key 明文

#### Scenario: 创建时一次性返回明文
- **WHEN** 管理员创建一个新 Key
- **THEN** 创建响应返回完整 Key 明文，且此后任何接口都无法再次获取该 Key 明文

### Requirement: API Key 认证
对外接口 SHALL 通过 `Authorization: Bearer <key>` 请求头认证。Key 无效（不存在）、已禁用或请求头缺失/格式错误时，系统 MUST 返回 401 状态码与统一错误码，拒绝访问。

#### Scenario: 有效 Key 访问
- **WHEN** 三方使用存在且处于启用状态的 Key 调用对外接口
- **THEN** 请求通过认证，系统更新该 Key 的最近使用时间

#### Scenario: 无效或禁用的 Key 访问
- **WHEN** 三方使用不存在的 Key、已禁用的 Key、或缺失/格式错误的 Authorization 头调用对外接口
- **THEN** 系统返回 401，且对「Key 不存在」与「Key 已禁用」返回相同的错误响应结构，不泄露 Key 是否存在

### Requirement: API Key 生命周期管理
管理员 SHALL 能通过管理后台对 Key 执行：创建（指定名称/备注）、启用、禁用、删除、分页查询列表。管理操作 MUST 使用管理员 session 认证（与内部 API 一致），列表响应 MUST NOT 包含 Key 明文。

#### Scenario: 禁用 Key 立即生效
- **WHEN** 管理员禁用一个 Key 后，三方立即使用该 Key 调用对外接口
- **THEN** 请求被拒绝并返回 401

#### Scenario: 删除 Key
- **WHEN** 管理员删除一个 Key
- **THEN** 该 Key 不再出现在列表中，且使用该 Key 的请求返回 401
