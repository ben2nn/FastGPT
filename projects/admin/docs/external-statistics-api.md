# 对外统计数据接口文档

三方系统通过本接口拉取模型调用统计数据。接口只读，通过 API Key 鉴权。

## 接入准备

1. 联系管理后台管理员，在「API 密钥」页面创建一个 Key，获取完整 Key 明文（**仅创建时展示一次**，请妥善保存）
2. 后续调用均使用该 Key 认证

## 接口定义

```
GET /api/external/statistics/list
```

- 仅支持 `GET`，其他方法返回 405
- 接口只读，不产生任何数据变更

### 认证

请求头携带 API Key：

```
Authorization: Bearer <你的API Key>
```

- Key 无效、已禁用、请求头缺失或格式错误时，统一返回 `401`（不区分 Key 是否存在）
- Key 被禁用或删除后立即失效

### 查询参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `startTime` | 是 | 开始时间，ISO 8601 格式（如 `2026-01-01T00:00:00+08:00`）；不带时区偏移时按业务时区（Asia/Shanghai）解析 |
| `endTime` | 是 | 结束时间，ISO 8601 格式；略晚于当前时间会收敛到当前时间 |
| `appId` | 否 | 应用 ID，**精确匹配**，支持多值（逗号分隔如 `appId=a,b` 或重复参数 `appId=a&appId=b`），命中任一即返回 |
| `appName` | 否 | 应用名称，**模糊匹配**（不区分大小写的包含匹配） |
| `modelId` | 否 | 模型 ID，**精确匹配**，支持多值（语法同 `appId`），命中任一即返回 |
| `modelName` | 否 | 模型名称，**模糊匹配**（不区分大小写的包含匹配） |
| `modelCategory` | 否 | 模型类别，取值 `chat`（对话）、`embedding`（向量）、`rerank`（重排）；支持多值（语法同 `appId`），命中任一类别即返回 |
| `pageNum` | 否 | 页码，正整数，默认 `1` |
| `pageSize` | 否 | 每页数量，1–100，默认 `20` |

**约束**：

- 时间区间必填，开始时间必须早于结束时间，区间最长 365 天
- 模糊匹配中的 `%`、`_` 等字符按字面值匹配，不作为通配符
- 多个筛选条件同时传入时为「与」关系；同一参数的多个取值之间为「或」关系（命中任一即返回）
- `appId`/`modelId`/`modelCategory` 多值规则：
  - 逗号 `,` 为分隔符，ID 本身不含逗号；每个取值自动去除首尾空白
  - 取值不能为空（如 `appId=a,,b` 或纯空白返回 400 `INVALID_FILTER_PARAM`）
  - 单个参数最多 50 个取值，超过返回 400 `INVALID_FILTER_PARAM`
  - `modelCategory` 取值仅支持 `chat`/`embedding`/`rerank`，其他取值返回 400 `INVALID_FILTER_PARAM`

### 响应结构

成功（`200`）：

```json
{
  "total": 12,
  "list": [
    {
      "appId": "6712abc...",
      "appName": "客服机器人",
      "modelId": "gpt-4o-mini",
      "modelName": "gpt-4o-mini",
      "modelCategory": "chat",
      "usageScenario": "chatNode",
      "callCount": 1520,
      "totalTokens": 1834400,
      "totalPoints": 917.2,
      "totalDuration": 5472.5,
      "avgDuration": 3.6,
      "successRate": 99.8,
      "avgTokensPerCall": 1206.8
    }
  ],
  "pageNum": 1,
  "pageSize": 20
}
```

| 字段 | 说明 |
|---|---|
| `total` | 满足条件的「应用 + 模型 + 模型类别 + 使用场景」组合总数（与列表分组一致） |
| `list[].callCount` | 调用次数 |
| `list[].totalTokens` | 总 Token 数 |
| `list[].totalPoints` | 总积分消耗 |
| `list[].totalDuration` | 总耗时（秒） |
| `list[].avgDuration` | 平均每次调用耗时（秒） |
| `list[].successRate` | 成功率（百分比，0–100） |
| `list[].avgTokensPerCall` | 平均每次调用 Token 数 |
| `list[].modelCategory` | 模型类别：`chat`（对话）/ `embedding`（向量）/ `rerank`（重排） |

### 错误响应

所有错误返回结构：

```json
{
  "code": "<错误码>",
  "message": "<错误说明>",
  "details": { ... }   // 部分错误附带
}
```

| HTTP 状态码 | code | 场景 |
|---|---|---|
| 400 | `INVALID_TIME_RANGE` | 时间格式非法、开始时间晚于/等于结束时间、区间超过 365 天、开始时间在未来、其他参数格式错误（见 `details.errors`） |
| 400 | `INVALID_PAGINATION` | `pageNum` 或 `pageSize` 非法（如 `pageSize` > 100） |
| 400 | `INVALID_FILTER_PARAM` | `appId`/`modelId`/`modelCategory` 多值取值非法：取值为空白、取值数量超过 50，或 `modelCategory` 取值不在枚举内 |
| 401 | `UNAUTHORIZED` | API Key 缺失、格式错误、无效或已禁用 |
| 405 | `METHOD_NOT_ALLOWED` | 非 GET 请求 |
| 500 | `DATABASE_ERROR` | 服务内部错误（不泄露内部细节） |
| 504 | `QUERY_TIMEOUT` | 查询超时，请缩小时间范围或增加筛选条件 |

### 数据粒度说明

数据按「应用 + 模型 + 模型类别 + 使用场景」分组聚合，只统计指定时间区间内 `model_call_logs` 表的调用记录。

统计口径排除模型归因失败的记录（`model_id` / `model_name` 为 `unknown` 的历史遗留数据不参与任何统计计算，如模型配置删除期间产生的调用）；如需统计该类数据，请与管理员另行约定。

统计口径覆盖**全部模型类别**：除对话模型（LLM）外，知识库搜索产生的向量模型与重排模型调用、以及搜索节点内的问题优化/深度搜索 LLM 调用同样计入。每条记录的 `modelCategory` 标识其所属类别；同一次知识库搜索会按参与模型拆分为多行（向量行/重排行/LLM 行），各行独立计数。

> 口径说明：纳入向量与重排后，「总调用次数」「总 Token 数」等汇总指标相较此前版本会变大；如需仅对比对话模型，请传 `modelCategory=chat`。

## 调用示例

### 拉取全部统计（最近 7 天）

```bash
curl -s "https://<管理后台地址>/api/external/statistics/list?startTime=2026-11-16T00%3A00%3A00%2B08%3A00&endTime=2026-11-23T00%3A00%3A00%2B08%3A00" \
  -H "Authorization: Bearer dek_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 按应用名称模糊筛选

返回应用名称包含「客服」的所有应用数据（不区分大小写）：

```bash
curl -s -G "https://<管理后台地址>/api/external/statistics/list" \
  --data-urlencode "startTime=2026-11-16T00:00:00+08:00" \
  --data-urlencode "endTime=2026-11-23T00:00:00+08:00" \
  --data-urlencode "appName=客服" \
  -H "Authorization: Bearer dek_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 按模型 ID 精确 + 模型名称模糊组合筛选

```bash
curl -s -G "https://<管理后台地址>/api/external/statistics/list" \
  --data-urlencode "startTime=2026-11-16T00:00:00+08:00" \
  --data-urlencode "endTime=2026-11-23T00:00:00+08:00" \
  --data-urlencode "modelId=gpt-4o-mini" \
  --data-urlencode "modelName=gpt" \
  --data-urlencode "pageNum=1" \
  --data-urlencode "pageSize=50" \
  -H "Authorization: Bearer dek_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 按多个应用 + 多个模型筛选（多值，命中任一即返回）

返回「应用 A 或 B」且「模型 X 或 Y」的统计数据：

```bash
curl -s -G "https://<管理后台地址>/api/external/statistics/list" \
  --data-urlencode "startTime=2026-11-16T00:00:00+08:00" \
  --data-urlencode "endTime=2026-11-23T00:00:00+08:00" \
  --data-urlencode "appId=6712abc...,6712def..." \
  --data-urlencode "modelId=gpt-4o,gpt-4o-mini" \
  -H "Authorization: Bearer dek_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

等价的重复参数写法：`appId=6712abc...&appId=6712def...&modelId=gpt-4o&modelId=gpt-4o-mini`

### 按模型类别筛选（向量 + 重排）

返回知识库搜索产生的向量与重排模型用量（不含对话模型）：

```bash
curl -s -G "https://<管理后台地址>/api/external/statistics/list" \
  --data-urlencode "startTime=2026-11-16T00:00:00+08:00" \
  --data-urlencode "endTime=2026-11-23T00:00:00+08:00" \
  --data-urlencode "modelCategory=embedding,rerank" \
  -H "Authorization: Bearer dek_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 认证失败示例（401）

```bash
$ curl -s "https://<管理后台地址>/api/external/statistics/list?startTime=2026-11-16T00%3A00%3A00%2B08%3A00&endTime=2026-11-23T00%3A00%3A00%2B08%3A00" \
    -H "Authorization: Bearer dek_wrong_key"
{"code":"UNAUTHORIZED","message":"UNAUTHORIZED: 无效的 API Key"}
```

## 安全与使用建议

- Key 属敏感凭据，请勿写入前端代码或公开仓库；建议由服务端持有并定期轮换（新建 Key → 切换 → 禁用旧 Key）
- 请在服务端设置合理的拉取频率与超时时间；建议拉取间隔不低于 1 分钟
- 接口查询超时为 15 秒，遇到 504 请缩小时间区间或增加筛选条件
