# Admin 知识库管理功能设计文档

## 1. 概述

将 APP 项目的知识库（Dataset）管理功能复制到 `projects/admin/` 项目中，作为管理员全局管理所有团队知识库的入口。

### 1.1 与 APP 版本的区别

| 维度 | APP 版本 | Admin 版本 |
|------|---------|-----------|
| 数据范围 | 当前团队的知识库 | **所有团队**的知识库 |
| 认证方式 | APP 的 session/JWT | Admin 的 JWT（admin_token） |
| UI 风格 | 卡片网格 + 文件夹导航 + 详情页 | **表格列表**（与 admin 现有风格一致） |
| 功能范围 | 完整 CRUD + 导入/导出/训练/搜索测试 | 列表查看 + 搜索 + 删除 + 查看详情 |
| 创建/编辑 | 支持（含多种类型） | **不支持**（管理视角，非创建视角） |
| 权限管理 | 完整的协作者/权限系统 | 不需要（admin 拥有全部权限） |

### 1.2 功能范围

**第一期（本次实现）：**
- ✅ 知识库列表（表格视图，显示所有团队的知识库）
- ✅ 按名称/团队搜索过滤
- ✅ 删除知识库
- ✅ 显示知识库详情信息（类型、向量模型、集合数量、数据量等）
- ✅ 侧边栏菜单入口

**暂不实现：**
- ❌ 知识库详情页（集合管理、数据管理、搜索测试等）
- ❌ 创建/编辑知识库
- ❌ 导入/导出（admin 已有独立的导入导出页面）

## 2. 架构设计

### 2.1 文件结构

```
projects/admin/src/
├── pages/
│   ├── _app.tsx                          # 修改：添加 /dataset/list 到 PREFETCH_ROUTES
│   └── dataset/
│       └── list/
│           └── index.tsx                 # 新增：知识库列表页面
├── pages/api/extend/dataset/
│   ├── exportByParentId.ts               # 已有
│   ├── importFromJson.ts                 # 已有
│   ├── list.ts                           # 新增：获取所有知识库列表 API
│   └── [datasetId].ts                    # 新增：删除/获取知识库详情 API
├── web/
│   ├── context/Layout/
│   │   └── AdminSidebar.tsx              # 修改：添加知识库管理菜单项
│   └── core/extend/
│       └── api.ts                        # 修改：添加知识库管理 API 函数
└── types/
    └── dataset.d.ts                      # 新增：知识库相关类型定义
```

### 2.2 页面布局

参照 `user/list/index.tsx` 的表格布局模式：

```
┌─────────────────────────────────────────────┐
│  知识库管理                                   │
├─────────────────────────────────────────────┤
│  [搜索框: 搜索知识库名称...]                    │
├─────────────────────────────────────────────┤
│  名称 | 类型 | 所属团队 | 向量模型 | 集合数 | 操作 │
│  ─────────────────────────────────────────── │
│  KB1  | 通用 | TeamA   | ada-002 | 12   | 删除 │
│  KB2  | 网站 | TeamB   | text3   | 5    | 删除 │
│  ...                                        │
└─────────────────────────────────────────────┘
```

## 3. API 设计

### 3.1 获取知识库列表

**端点:** `GET /api/extend/dataset/list`

**查询参数:**
- `search` (string, 可选): 按名称搜索
- `teamId` (string, 可选): 按团队过滤
- `type` (string, 可选): 按类型过滤
- `page` (number, 可选, 默认 1): 页码
- `pageSize` (number, 可选, 默认 20): 每页数量

**响应:**
```json
{
  "list": [
    {
      "_id": "...",
      "name": "知识库名称",
      "type": "dataset",
      "avatar": "...",
      "intro": "...",
      "teamId": "...",
      "teamName": "团队名称",
      "vectorModel": { "model": "text-embedding-ada-002", "provider": "openai" },
      "agentModel": { "model": "gpt-4" },
      "parentId": null,
      "createTime": "2024-01-01T00:00:00Z",
      "updateTime": "2024-01-01T00:00:00Z",
      "collectionCount": 12,
      "dataCount": 1500
    }
  ],
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

**实现要点:**
- 从 `MongoDataset` 查询所有文档（不限 teamId）
- 关联查询 `MongoTeam` 获取团队名称
- 聚合查询 `MongoDatasetCollection` 获取集合数量
- 聚合查询 `MongoDatasetData` 获取数据量

### 3.2 删除知识库

**端点:** `DELETE /api/extend/dataset/[datasetId]`

**实现要点:**
- Admin 项目**没有 BullMQ**，不能使用异步任务队列
- 使用**软删除**：设置 `deleteTime` 字段标记删除
- 列表查询时过滤 `deleteTime: null` 的记录
- 实际数据清理由主应用的后台任务负责（如果主应用也在运行）

### 3.3 获取知识库详情

**端点:** `GET /api/extend/dataset/[datasetId]`

**响应:** 返回知识库详细信息，包括集合列表和统计信息。

## 4. 详细实现计划

### 步骤 1：添加类型定义

**文件:** `projects/admin/src/types/dataset.d.ts`

```typescript
export type AdminDatasetItem = {
  _id: string;
  name: string;
  type: string;
  avatar: string;
  intro: string;
  teamId: string;
  teamName: string;
  vectorModel: {
    model: string;
    provider: string;
    name?: string;
  };
  parentId?: string;
  createTime: string;
  updateTime: string;
  collectionCount: number;
  dataCount: number;
};

export type AdminDatasetListResponse = {
  list: AdminDatasetItem[];
  total: number;
  page: number;
  pageSize: number;
};
```

### 步骤 2：创建 API 端点

#### 2a. 列表 API: `pages/api/extend/dataset/list.ts`

- 使用 `NextAPI(handler)` 包装
- JWT 认证（复用现有模式）
- 查询 `MongoDataset`，关联 `MongoTeam` 获取团队名称
- 支持搜索、分页
- 使用 `MongoDatasetCollection.countDocuments` 和 `MongoDatasetData.countDocuments` 统计数量

#### 2b. 删除 API: `pages/api/extend/dataset/[datasetId].ts`

- DELETE 方法：调用 `deleteDataset` 删除知识库及其关联数据
- GET 方法：返回知识库详情

### 步骤 3：添加前端 API 函数

**文件:** `projects/admin/src/web/core/extend/api.ts`

```typescript
// 知识库管理 API
export const fetchDatasets = async (params?: {
  search?: string;
  teamId?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}) => { ... };

export const deleteDataset = async (datasetId: string) => { ... };

export const fetchDatasetDetail = async (datasetId: string) => { ... };
```

### 步骤 4：创建知识库列表页面

**文件:** `projects/admin/src/pages/dataset/list/index.tsx`

遵循 admin 现有页面模式：
- `<ProtectedRoute>` + `<Layout title="知识库管理">` 包装
- 白色卡片容器 + 搜索框 + 表格
- 表格列：名称（含头像）、类型、所属团队、向量模型、集合数、数据量、操作
- 操作列：查看详情、删除
- 使用 `useToast` 显示操作反馈
- 分页支持

### 步骤 5：修改侧边栏菜单

**文件:** `projects/admin/src/web/context/Layout/AdminSidebar.tsx`

在 `menuItems` 数组中添加（位于"团队管理"之后、"导入导出"之前）：

```typescript
{
  label: '知识库管理',
  icon: 'core/dataset/commonDatasetColor',
  activeIcon: 'core/dataset/commonDatasetColor',
  path: '/dataset/list',
  activeLinks: ['/dataset']
}
```

### 步骤 6：更新路由预加载

**文件:** `projects/admin/src/pages/_app.tsx`

在 `PREFETCH_ROUTES` 数组中添加 `'/dataset/list'`。

## 5. 关键技术决策

### 5.1 为什么使用表格而非卡片网格？

Admin 项目的现有页面（用户管理、团队管理）全部使用表格布局，保持风格一致。管理员更关注数据概览和批量操作，表格更适合。

### 5.2 为什么不复用 APP 的组件？

APP 的知识库组件深度依赖：
- `use-context-selector` 的 `DatasetsContext`
- `@fastgpt/web` 的大量共享组件（MyBox, MyMenu, FolderPath, Avatar 等）
- `@fastgpt/global` 的类型和常量
- i18n 翻译系统
- 权限系统（`permission.hasWritePer` 等）
- `useRequest` hooks

直接复制会导致大量依赖需要适配。Admin 项目使用简化的 UI 模式（纯 Chakra UI），保持独立性更好。

### 5.3 数据库查询

Admin 的 API 端点可以直接使用 `@fastgpt/service` 的 MongoDB 模型（已有先例，如 `exportByParentId.ts`），但需要注意：
- 不做 teamId 过滤（查询所有团队）
- 需要关联查询 `MongoTeam` 获取团队名称
- 使用 `connectToDatabase()` 连接数据库

## 6. 依赖关系

### 已有依赖（可直接使用）
- `@fastgpt/service/core/dataset/collection/schema` → `MongoDatasetCollection`
- `@fastgpt/service/core/dataset/data/schema` → `MongoDatasetData`
- `@fastgpt/service/core/dataset/controller` → `deleteDataset` 等
- `@fastgpt/service/support/permission/controller` → `authJWT`
- `@/service/middleware/entry` → `NextAPI`
- `@/service/common/mongo` → `connectToDatabase`

### 需要新增的依赖
- `@fastgpt/service/core/dataset/schema` → `MongoDataset`（用于直接查询数据集表）
- `@fastgpt/service/support/user/team/teamSchema` → `MongoTeam`（用于获取团队名称）

## 7. 实施顺序

1. 创建 `types/dataset.d.ts` — 类型定义
2. 创建 `pages/api/extend/dataset/list.ts` — 列表 API
3. 创建 `pages/api/extend/dataset/[datasetId].ts` — 详情/删除 API
4. 修改 `web/core/extend/api.ts` — 前端 API 函数
5. 创建 `pages/dataset/list/index.tsx` — 列表页面
6. 修改 `web/context/Layout/AdminSidebar.tsx` — 侧边栏菜单
7. 修改 `pages/_app.tsx` — 路由预加载
