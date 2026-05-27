# App 导入导出配置扩展设计

## 概述

扩展 App 导入导出功能，在导出 JSON 中新增 `outLinks`（免登录窗口 + 门户配置）和 `openApis`（API 访问 Key）数据，实现配置信息的完整迁移。

## 背景

当前 App 导入导出仅包含 `apps` 和 `versions` 两个集合的数据。用户在迁移应用时，需要手动重新配置：
- **免登录窗口**（OutLink）：shareId、展示配置、第三方平台配置
- **门户**（Playground）：showRunningStatus、showCite、showFullText 等可见性配置（存储在 OutLink 文档上）
- **API 访问**（OpenApi/APIKey）：apiKey、限额配置

## 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| APIKey 导出 | 通过 `keepApiKey` 参数控制 | 安全性：默认不导出原 Key，支持灵活选择 |
| 统计数据 | 不导出 | usagePoints/lastUsedTime 等属于运行时数据，无需迁移 |
| shareId | 保留原值 | 用户确认保持一致 |
| 方案选择 | 扩展现有 JSON 结构 | 改动集中、一个文件包含所有内容 |

## 导出数据结构

JSON 版本从 `1.0` 升级到 `2.0`：

```json
{
  "version": "2.0",
  "type": "app",
  "exportTime": "2026-05-27T...",
  "teamId": "...",
  "apps": [...],
  "versions": [...],
  "outLinks": [
    {
      "_id": "...",
      "shareId": "...",
      "appId": "...",
      "type": "publishChannel",
      "name": "免登录窗口",
      "showRunningStatus": true,
      "showCite": true,
      "showFullText": false,
      "canDownloadSource": false,
      "showWholeResponse": true,
      "limit": {
        "maxUsagePoints": -1,
        "expiredTime": null,
        "QPM": 1000,
        "hookUrl": null
      },
      "app": {},
      "immediateResponse": null,
      "defaultResponse": null
    }
  ],
  "openApis": [
    {
      "_id": "...",
      "appId": "...",
      "name": "API Key",
      "apiKey": "sk-xxxx",
      "limit": {
        "expiredTime": null,
        "maxUsagePoints": -1
      }
    }
  ]
}
```

### 排除字段

| 集合 | 排除字段 | 原因 |
|------|----------|------|
| OutLink | teamId, tmbId, usagePoints, lastTime | 运行时/团队数据，导入时重新赋值 |
| OpenApi | teamId, tmbId, usagePoints, lastUsedTime, createTime | 运行时/团队数据 |

### apiKey 处理

- 默认不导出 apiKey 值（`keepApiKey=false`）
- 请求参数 `keepApiKey=true` 时导出原值
- 导入时 `keepApiKey=true` 保留原 Key，`keepApiKey=false` 生成新 Key
- 新 Key 格式：`fastgpt_` + 随机 48 字符

## 接口修改

### 1. 导出接口

#### exportByParentId.ts

**路径**: `projects/admin/src/pages/api/extend/app/exportByParentId.ts`

修改点：
- 新增请求参数 `keepApiKey`（boolean，默认 false）
- 用已查到的 appIds 查询 `MongoOutLink`（排除统计字段，lean 查询）
- 用已查到的 appIds 查询 `MongoOpenApi`（排除统计字段，lean 查询）
- openApi 的 apiKey 字段：`keepApiKey=false` 时不包含该字段
- 版本号改为 `2.0`
- 导出数据增加 `outLinks` 和 `openApis` 字段

#### exportTools.ts

**路径**: `projects/admin/src/pages/api/extend/tool/exportTools.ts`

同上修改，保持一致。

### 2. 导入接口

#### importFromJson.ts

**路径**: `projects/admin/src/pages/api/extend/app/importFromJson.ts`

修改点：
- 新增请求参数 `keepApiKey`（boolean，默认 false）
- 版本校验兼容 `1.0` 和 `2.0`
- 解析 `outLinks` 和 `openApis`（可选字段，v1.0 缺失则跳过）
- 为 outLinks 和 openApis 的 `_id` 生成新 ID 并加入 idMap
- outLink 处理：
  - 映射 `appId`（通过 idMap）
  - 设置 `teamId`、`tmbId`（来自 JWT）
  - 保留 `shareId` 原值
  - 生成新的 `_id`
- openApi 处理：
  - 映射 `appId`（通过 idMap）
  - 设置 `teamId`、`tmbId`（来自 JWT）
  - `keepApiKey=false` 时生成新 apiKey
  - 生成新的 `_id`
- 分批写入 `MongoOutLink` 和 `MongoOpenApi`
- 返回结果增加 `outLinksCount` 和 `openApisCount`

#### importTools.ts

**路径**: `projects/admin/src/pages/api/extend/tool/importTools.ts`

同上修改，保持一致。

## 向后兼容

| 导入文件版本 | 行为 |
|-------------|------|
| v1.0 | 正常导入 apps + versions，outLinks/openApis 缺失则跳过 |
| v2.0 | 完整导入 apps + versions + outLinks + openApis |

## 涉及文件

| 文件 | 操作 |
|------|------|
| `projects/admin/src/pages/api/extend/app/exportByParentId.ts` | 修改 |
| `projects/admin/src/pages/api/extend/app/importFromJson.ts` | 修改 |
| `projects/admin/src/pages/api/extend/tool/exportTools.ts` | 修改 |
| `projects/admin/src/pages/api/extend/tool/importTools.ts` | 修改 |

## 数据流

```
导出:
  App IDs → 查询 OutLink(appId in ids) → 过滤统计字段 → outLinks
  App IDs → 查询 OpenApi(appId in ids) → 过滤统计字段 → openApis
  → 组装 JSON {version: '2.0', apps, versions, outLinks, openApis}

导入:
  解析 JSON → 校验版本 → 提取 apps/versions/outLinks/openApis
  → 生成 ID 映射 → 映射引用字段(appId)
  → 设置 teamId/tmbId → 处理 apiKey
  → 分批写入 MongoApp/MongoAppVersion/MongoOutLink/MongoOpenApi
```
