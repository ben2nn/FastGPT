# Admin 知识库代码全面差异分析

## 一、概述

Admin 项目的知识库代码是从 App 项目简化移植而来，但存在大量功能缺失和实现差异。以下是全面的差异分析。

---

## 二、API 层差异

### 2.1 认证机制差异

| 维度 | App | Admin |
|------|-----|-------|
| 认证方式 | Token (next-auth session) + ApiKey | JWT (admin_token from localStorage) |
| API 前缀 | `/api/core/dataset/` | `/api/extend/dataset/` |
| 权限模型 | 完整 RBAC (Owner/Manage/Write/Read) | 硬编码全权限 |

### 2.2 API 端点对比

#### App 有但 Admin 缺失的 API

| API 端点 | 功能 | 优先级 |
|----------|------|--------|
| `collection/create/` (11个子文件) | 多种集合创建方式(fileId/link/text/apiCollection/images/backup/template/reTraining/localFile) | 高 |
| `collection/listV2.ts` | V2 版集合列表(带分页) | 中 |
| `collection/scrollList.ts` | 滚动加载集合列表 | 中 |
| `collection/paths.ts` | 集合路径面包屑 | 中 |
| `collection/read.ts` | 读取集合源内容 | 中 |
| `collection/export.ts` | 导出集合数据 | 中 |
| `collection/sync.ts` | 同步集合 | 低 |
| `data/insertData.ts` | 插入单条数据 | 高 |
| `data/insertImages.ts` | 插入图片数据 | 低 |
| `data/pushData.ts` | 批量推送数据 | 中 |
| `data/update.ts` | 更新数据 | 高 |
| `data/detail.ts` | 获取数据详情 | 高 |
| `data/v2/list.ts` | V2 版数据列表 | 中 |
| `data/getPermission.ts` | 获取数据权限 | 低 |
| `data/getQuoteData.ts` | 获取引用数据 | 中 |
| `training/getTrainingDataDetail.ts` | 训练数据详情 | 中 |
| `training/getTrainingError.ts` | 训练错误列表 | 高 |
| `training/updateTrainingData.ts` | 更新训练数据 | 中 |
| `training/deleteTrainingData.ts` | 删除训练数据 | 中 |
| `apiDataset/list.ts` | API 数据集文件列表 | 低 |
| `apiDataset/listExistId.ts` | 检查文件 ID | 低 |
| `apiDataset/getCatalog.ts` | 获取目录 | 低 |
| `apiDataset/getPathNames.ts` | 获取路径名 | 低 |
| `file/getPreviewChunks.ts` | 预览分块 | 中 |
| `createWithFiles.ts` | 创建并上传文件 | 中 |
| `exportAll.ts` | 导出全部数据(CSV) | 高 |
| `resumeInheritPermission.ts` | 恢复继承权限 | 低 |
| `presignDatasetFilePostUrl.ts` | 预签名上传 URL | 中 |

#### Admin 存在但实现简化的 API

| API 端点 | App 实现 | Admin 实现 | 差异 |
|----------|----------|------------|------|
| `list.ts` | 完整权限过滤 + 分页 + 模型信息 | 简单查询 + 团队名 | 缺权限、模型信息 |
| `create.ts` | 权限检查 + 限额检查 + session | 直接创建 | 缺权限、限额 |
| `[datasetId].ts` (GET) | 完整详情 + 同步状态 + 模型对象 | 简单查询 + 团队名 | 缺同步状态 |
| `[datasetId].ts` (PUT) | 完整字段 + 同步调度 + 训练更新 | 白名单字段 | 缺同步、训练 |
| `[datasetId].ts` (DELETE) | 递归删除 + 异步任务队列 | 软删除 | 缺级联删除 |
| `searchTest.ts` | 完整搜索(嵌入+全文+RRF+Rerank) | **空实现,返回空数组** | 完全缺失 |
| `collection/list.ts` | 聚合查询 + 标签 + 训练/数据量 | 简单聚合 | 缺标签、训练量 |
| `collection/[id].ts` | 完整详情 + 文件元数据 + 向量数 | 简单查询 | 缺元数据 |
| `collection/delete.ts` | 递归查找子集合 + session + 文件删除 | 硬删除数据+集合 | 缺递归、文件清理 |
| `collection/create.ts` | 通过 createOneCollection 统一创建 | 简化创建 | 缺统一入口 |
| `collection/trainingDetail.ts` | 真实查询训练数/错误数 | **空实现,返回0** | 完全缺失 |
| `data/list.ts` | 分页 + 格式化 | 简单分页 | 缺格式化 |
| `training/rebuildEmbedding.ts` | 完整重建(检查+创建训练任务) | 仅更新 updateTime | **功能完全不同** |
| `training/queue.ts` | 查 training + rebuilding 数 | 类似实现 | 基本一致 |
| `folder/create.ts` | 权限检查 + session + 协作者 | 直接创建 | 缺权限、协作者 |

### 2.3 Admin 特有的 API

| API 端点 | 功能 | 说明 |
|----------|------|------|
| `models.ts` | 获取模型列表 | App 从 useSystemStore 获取,Admin 需要单独 API |
| `uploadFiles.ts` | 批量上传文件(简化版) | App 使用 createWithFiles + 多种 collection create |
| `exportByParentId.ts` | 按父 ID 导出 | App 使用 exportAll |
| `importFromJson.ts` | JSON 导入 | Admin 特有 |
| `tag/all.ts` | 获取所有标签 | App 通过 collection list 聚合获取 |
| `tag/list.ts` | 标签分页列表 | App 通过 collection list 聚合获取 |
| `tag/create.ts` | 创建标签 | App 使用不同路径 |

---

## 三、前端组件差异

### 3.1 目录结构差异

```
App:  src/pageComponents/dataset/     Admin: src/components/dataset/
App:  src/web/core/dataset/           Admin: src/web/core/dataset/
App:  src/components/core/dataset/    Admin: (缺失)
```

### 3.2 组件功能对比

| 组件 | App | Admin | 缺失功能 |
|------|-----|-------|----------|
| **List** | 完整(导出/权限/拖拽/协作) | 简化(基础CRUD) | 导出、权限管理、拖拽排序、创建者信息 |
| **CreateModal** | 5种类型 + AI模型选择器 + 合规提示 | 3种类型 + MySelect | 飞书/语雀、AIModelSelector、合规提示 |
| **SideTag** | 国际化 + 灰底样式 | 硬编码 + 彩底样式 | 国际化 |
| **NavBar** | 2个tab + 国际化 | 3个tab + 硬编码 | Tab 结构不同 |
| **CollectionCard/index** | 懒加载 + 浮动操作栏 + 拖拽 + 标签 + 训练状态 | 同步引入 + 内联操作栏 | 拖拽、标签、训练状态、启用开关 |
| **CollectionCard/Header** | 597行,5种数据集类型 + 标签管理 + 路径导航 | 152行,统一处理 | 路径导航、标签、网站同步、多种导入 |
| **CollectionCard/Context** | 完整(filterTags/同步/网站配置) | 简化(基础分页) | 标签过滤、同步、网站配置 |
| **DataCard** | 滚动分页 + 编辑 + 图片 + 导出 + 训练状态 | 传统分页 + 只读 | 编辑、图片、导出、训练状态 |
| **Test** | 完整(多模式 + 历史 + 结果展示) | 简化(基础搜索) | 搜索模式、历史、结果详情 |
| **Info** | 完整(模型选择 + 同步 + API配置 + 权限) | 简化(只读模型 + 基础配置) | VLM、同步、API配置、权限管理 |
| **Import** | 7种导入源 + Context架构 | 3种导入(文件/链接/文本) | 外部文件、API、图片、重训练 |

### 3.3 App 有但 Admin 完全缺失的组件

| 组件路径 | 功能 |
|----------|------|
| `pageComponents/dataset/EditFolderModal.tsx` | 编辑文件夹弹窗 |
| `pageComponents/dataset/MemberManager.tsx` | 成员管理 |
| `pageComponents/dataset/detail/MetaDataCard.tsx` | 元数据卡片 |
| `pageComponents/dataset/detail/InputDataModal.tsx` | 数据编辑弹窗 |
| `pageComponents/dataset/detail/CollectionCard/EmptyCollectionTip.tsx` | 空集合提示 |
| `pageComponents/dataset/detail/CollectionCard/BackupImportModal.tsx` | 备份导入 |
| `pageComponents/dataset/detail/CollectionCard/TemplateImportModal.tsx` | 模板导入 |
| `pageComponents/dataset/detail/CollectionCard/WebsiteConfig.tsx` | 网站配置 |
| `pageComponents/dataset/detail/CollectionCard/TagsPopOver.tsx` | 标签弹窗 |
| `pageComponents/dataset/detail/CollectionCard/TagManageModal.tsx` | 标签管理 |
| `pageComponents/dataset/detail/CollectionCard/HeaderTagPopOver.tsx` | 头部标签 |
| `pageComponents/dataset/detail/CollectionCard/TrainingStates.tsx` | 训练状态 |
| `pageComponents/dataset/detail/data/InsertImageModal.tsx` | 插入图片 |
| `pageComponents/dataset/detail/Import/` (整个目录,16个文件) | 完整导入系统 |
| `pageComponents/dataset/detail/Info/components/EditApiServiceModal.tsx` | API服务编辑 |
| `pageComponents/dataset/detail/Form/CollectionChunkForm.tsx` | 分块配置表单 |
| `components/core/dataset/DatasetTypeTag.tsx` | 类型标签 |
| `components/core/dataset/QuoteItem.tsx` | 引用项 |
| `components/core/dataset/RawSourceBox.tsx` | 原始源 |
| `components/core/dataset/SearchParamsTip.tsx` | 搜索参数提示 |
| `components/core/dataset/SelectModal.tsx` | 选择弹窗 |

---

## 四、Web 核心层差异

### 4.1 API 客户端 (`api.ts`)

| 维度 | App | Admin |
|------|-----|-------|
| 请求封装 | `GET/POST/PUT/DELETE` from `@/web/common/api/request` | 自定义 `authFetch` + `fetch` |
| 认证 | next-auth session token | localStorage `admin_token` |
| API 前缀 | `/api/core/dataset/` | `/api/extend/dataset/` |
| 缺失函数 | - | ~25个函数 |
| 类型约束 | 完整 TypeScript 类型 | 大量 `any` |

### 4.2 Context

| 维度 | App | Admin |
|------|-----|-------|
| DatasetPageContext | 完整(模型转换 + API数据清理) | 简化(简单 state spread) |
| DatasetsContext | 完整(文件夹导航 + 移动 + 编辑 + 删除) | **完全空实现** |
| 列表 Context | `web/core/dataset/context/datasetsContext.tsx` | `pages/dataset/list/context.tsx`(有功能但不同于 App) |

### 4.3 Store

| Store | App | Admin |
|-------|-----|-------|
| `useDatasetStore` | 全局数据集列表管理 | **缺失** |
| `useSearchTestStore` | 搜索测试历史(持久化) | **缺失** |

### 4.4 常量和类型

| 文件 | App | Admin |
|------|-----|-------|
| `constants.ts` | `defaultDatasetDetail`, `defaultCollectionDetail`, `TrainingProcess` | **缺失** |
| `type.d.ts` | `ImportSourceItemType`, `ImportSourceParamsType` | **缺失** |

---

## 五、架构模式差异总结

| 维度 | App | Admin |
|------|-----|-------|
| 页面包裹 | 直接渲染(布局在 _app.tsx) | ProtectedRoute + Layout |
| 国际化 | `useTranslation` + i18n | 硬编码中文 |
| 权限体系 | 完整 RBAC | 硬编码全权限 |
| 商业功能 | feConfigs.isPlus 检查 | 无 |
| SSR | getServerSideProps + serviceSideProps | getServerSideProps(简化) |
| 组件懒加载 | 大量 dynamic() | 少量 dynamic() |
| 数据库操作 | 通过 service 层 + session | 直接操作 MongoDB |
| 删除策略 | 软删除 + 异步清理队列 | 混合(数据集软删除,集合/数据硬删除) |
