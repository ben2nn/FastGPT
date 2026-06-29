# Admin 知识库管理 - 实施计划

## 目标
将 APP 的知识库管理功能适配到 `projects/admin/` 项目，提供全局视角（跨团队）的知识库管理能力。

## 实施步骤

### 1. 类型定义
- **文件**: `projects/admin/src/types/dataset.d.ts`
- 定义 `AdminDatasetItem`、`AdminDatasetListResponse` 类型

### 2. 后端 API
- **列表 API**: `projects/admin/src/pages/api/extend/dataset/list.ts`
  - 查询所有团队的知识库（不过滤 teamId）
  - 关联 MongoTeam 获取团队名称
  - 支持搜索、分页
  - 统计集合数量和数据量
- **删除 API**: `projects/admin/src/pages/api/extend/dataset/[datasetId].ts`
  - 软删除（设置 deleteTime）
  - Admin 项目无 BullMQ，不做级联清理

### 3. 前端 API 函数
- **文件**: `projects/admin/src/web/core/extend/api.ts`
- 添加 `fetchDatasets`、`deleteDatasetById` 函数

### 4. 列表页面
- **文件**: `projects/admin/src/pages/dataset/list/index.tsx`
- 表格布局（与用户管理页面风格一致）
- 搜索、分页、删除操作

### 5. 菜单和路由
- **文件**: `projects/admin/src/web/context/Layout/AdminSidebar.tsx` — 添加菜单项
- **文件**: `projects/admin/src/pages/_app.tsx` — 添加预加载路由

## 关键决策
- 使用表格而非卡片网格（与 admin 风格一致）
- 软删除策略（admin 无 BullMQ）
- 不复用 APP 组件（依赖太深，保持 admin 独立性）
