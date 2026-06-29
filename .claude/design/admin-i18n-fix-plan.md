# Admin 项目国际化修复方案

## 问题根因

Admin 项目的国际化完全不工作，根本原因有两点：

### 1. `serviceSideProps` 从未被调用
`projects/admin/src/web/i18n/utils.ts` 中定义了 `serviceSideProps`，用于在 `getServerSideProps` 中加载翻译文件。但**所有 admin 页面都没有调用它**，导致 `next-i18next` 的翻译数据从未在服务端加载，`useTranslation()` hook 返回空翻译。

### 2. UI 文本全部硬编码中文
72 个 TSX 文件包含约 1292 处硬编码中文文本，完全没有使用 `t('namespace:key')` 的 i18n 模式。

### 额外发现：`next.config.js` 未配置 i18n
`projects/admin/next.config.js` 没有像 `projects/app` 那样导入 `next-i18next.config.js` 中的 `i18n` 配置到 Next.js 的配置中。这可能导致 Next.js 不识别 locale 路由。

## 影响范围

- 所有 admin 页面的 UI 文本均为中文，无法切换语言
- 仅有 3 个组件使用了 `useTranslation()`，但也因为翻译数据未加载而失效
- 仅有 `web/core/dataset/constants.ts` 使用了 `i18nT()`，但该函数只是透传 key

## 修复方案

修复分为 **4 个阶段**，建议按顺序执行。

### 阶段 1：基础设施修复（必须）

#### 1.1 修复 `next.config.js` - 添加 i18n 配置

**文件**: `projects/admin/next.config.js`

参照 `projects/app/next.config.js` 的做法，导入 i18n 配置：

```js
const { i18n } = require('./next-i18next.config.js');
const { NEXT_PUBLIC_BASE_URL } = process.env;

/** @type {import('next').NextConfig} */
const nextConfig = {
  i18n,  // 添加这一行
  basePath: NEXT_PUBLIC_BASE_URL,
  // ...其余配置不变
};
```

#### 1.2 修复 `i18nT` 函数 - 使其能在组件外部工作

**文件**: `projects/admin/src/web/i18n/utils.ts`

当前 `i18nT` 只是一个透传函数。由于 `constants.ts` 中在组件外部（模块顶层）使用 `i18nT`，此时 i18next 尚未初始化。

修复方式：将 `constants.ts` 中 `TrainingProcess` 的定义从模块顶层改为函数调用，延迟执行：

**方案 A（推荐）**: 改造 `constants.ts`，将静态对象改为 getter 函数

```typescript
// projects/admin/src/web/core/dataset/constants.ts
import { i18nT } from '@fastgpt/web/i18n/utils';

export const getTrainingProcess = () => ({
  waiting: {
    label: i18nT('dataset:process.Waiting'),
    value: 'waiting'
  },
  // ...
});

// 使用时改为：
// import { getTrainingProcess } from '...';
// const TrainingProcess = getTrainingProcess();
```

但这不解决根本问题——`i18nT` 本身在运行时不翻译。需要额外引入 i18next 实例。

**方案 B**: 直接使用 i18next 的 `t()` 函数

```typescript
// projects/admin/src/web/i18n/utils.ts
import i18n from 'i18next';

export const i18nT = (key: string): string => {
  // 如果 i18next 已初始化，使用它翻译；否则返回 key
  if (i18n.isInitialized) {
    return i18n.t(key);
  }
  return key;
};
```

**推荐方案 B**，因为它在 i18next 初始化后能正确翻译，未初始化时也不会崩溃。

#### 1.3 更新 `serviceSideProps` 路径

**文件**: `projects/admin/src/web/i18n/utils.ts`

当前 admin 项目有自己的 `serviceSideProps`，这是正确的做法（因为路径别名 `@fastgpt/web` 可用）。函数逻辑正常，不需要修改。重点是要在页面中调用它。

### 阶段 2：所有页面接入 `serviceSideProps`

每个页面文件的 `getServerSideProps` 需要调用 `serviceSideProps`，加载对应页面的翻译命名空间。

#### 2.1 不需要额外命名空间的页面（仅 common）

| 页面文件 | 修改方式 |
|---------|---------|
| `pages/dashboard/index.tsx` | 添加 `getServerSideProps` |
| `pages/statistics/index.tsx` | 添加 `getServerSideProps` |
| `pages/tasks/index.tsx` | 添加 `getServerSideProps` |
| `pages/tasks/[taskId].tsx` | 添加 `getServerSideProps` |
| `pages/team/list/index.tsx` | 添加 `getServerSideProps` |
| `pages/user/list/index.tsx` | 添加 `getServerSideProps` |
| `pages/import-export/index.tsx` | 添加 `getServerSideProps` |
| `pages/dataset/list/index.tsx` | 添加 `getServerSideProps` |

**模板**（无额外 ns）:
```typescript
import { serviceSideProps } from '@/web/i18n/utils';

export async function getServerSideProps(context: any) {
  return {
    props: {
      ...(await serviceSideProps(context))
    }
  };
}
```

#### 2.2 已有 `getServerSideProps` 的页面（需要合并）

| 页面文件 | 需要的 ns | 修改方式 |
|---------|----------|---------|
| `pages/index.tsx` | (无) | 在现有逻辑中合并 `serviceSideProps` |
| `pages/login/index.tsx` | `login` | 在现有逻辑中合并 `serviceSideProps` |
| `pages/dataset/detail/index.tsx` | `dataset`, `file` | 在现有逻辑中合并 `serviceSideProps` |
| `pages/dataset/list/index.tsx` | `dataset` | 添加 `getServerSideProps` |

**模板**（合并已有 props）:
```typescript
import { serviceSideProps } from '@/web/i18n/utils';

export async function getServerSideProps(context: any) {
  const token = context.req.cookies?.admin_token;

  if (!token) {
    return {
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }

  return {
    props: {
      ...(await serviceSideProps(context)) // 合并翻译 props
    }
  };
}
```

#### 2.3 按页面推荐命名空间汇总

| 页面 | 命名空间 |
|------|---------|
| `login/index.tsx` | `login` |
| `dashboard/index.tsx` | (仅 common) |
| `statistics/index.tsx` | (仅 common) |
| `tasks/index.tsx` | (仅 common) |
| `tasks/[taskId].tsx` | (仅 common) |
| `user/list/index.tsx` | `user` |
| `team/list/index.tsx` | `user` |
| `dataset/list/index.tsx` | `dataset` |
| `dataset/detail/index.tsx` | `dataset`, `file` |
| `import-export/index.tsx` | `dataset` |

### 阶段 3：新增 admin 专属翻译 key

admin 项目有很多独有的 UI 文本（如"任务管理"、"数据统计"、"导入导出"、"启用/禁用任务"等），这些在现有的 `packages/web/i18n` 翻译文件中不存在。

#### 3.1 方案：在现有 common.json 中新增 key

为减少改动范围，不创建新的 namespace，而是在 `common.json` 的 zh-CN/en/zh-Hant 文件中新增 admin 需要的 key。

#### 3.2 新增的 key 分类

**通用管理类**:
| Key | 中文 (zh-CN) | 英文 (en) | 频次 |
|-----|-------------|----------|------|
| `admin.task_management` | 任务管理 | Task Management | 高 |
| `admin.user_management` | 用户管理 | User Management | 高 |
| `admin.team_management` | 团队管理 | Team Management | 高 |
| `admin.data_statistics` | 数据统计 | Statistics | 高 |
| `admin.import_export` | 导入导出 | Import/Export | 高 |
| `admin.dashboard` | 首页 | Dashboard | 高 |
| `admin.manage_and_monitor_tasks` | 管理和监控系统定时任务 | Manage and monitor system scheduled tasks | 中 |
| `admin.login_success` | 登录成功 | Login successful | 中 |
| `admin.login_failed` | 登录失败 | Login failed | 中 |
| `admin.welcome_back` | 欢迎回来 | Welcome back | 中 |
| `admin.please_login` | 请登录管理员账号 | Please login with admin account | 中 |
| `admin.add_user` | 添加用户 | Add User | 中 |
| `admin.edit_user` | 编辑用户 | Edit User | 中 |
| `admin.create_user` | 创建用户 | Create User | 中 |
| `admin.search_username` | 搜索用户名... | Search username... | 中 |
| `admin.change_password` | 修改密码 | Change Password | 中 |
| `admin.confirm_delete_user` | 确定要删除此用户吗？ | Are you sure you want to delete this user? | 中 |

**任务管理类**:
| Key | 中文 | 英文 | 频次 |
|-----|------|------|------|
| `admin.task.name` | 任务名称 | Task Name | 高 |
| `admin.task.description` | 描述 | Description | 高 |
| `admin.task.cron_expression` | Cron 表达式 | Cron Expression | 高 |
| `admin.task.status` | 状态 | Status | 高 |
| `admin.task.last_execution` | 最近执行 | Last Execution | 高 |
| `admin.task.next_execution` | 下次执行 | Next Execution | 高 |
| `admin.task.operation` | 操作 | Operation | 高 |
| `admin.task.enable` | 启用 | Enable | 高 |
| `admin.task.disable` | 禁用 | Disable | 高 |
| `admin.task.enabled` | 已启用 | Enabled | 中 |
| `admin.task.disabled` | 已禁用 | Disabled | 中 |
| `admin.task.running` | 运行中 | Running | 中 |
| `admin.task.success` | 成功 | Success | 中 |
| `admin.task.failed` | 失败 | Failed | 中 |
| `admin.task.not_executed` | 未执行 | Not executed | 中 |
| `admin.task.execute` | 执行 | Execute | 中 |
| `admin.task.detail` | 详情 | Detail | 中 |
| `admin.task.history` | 历史 | History | 中 |
| `admin.task.no_tasks` | 暂无任务 | No tasks | 低 |
| `admin.task.refresh` | 刷新 | Refresh | 低 |

**数据统计类**:
| Key | 中文 | 英文 | 频次 |
|-----|------|------|------|
| `admin.statistics.query_failed` | 查询失败 | Query Failed | 高 |
| `admin.statistics.overview` | 总览 | Overview | 中 |
| `admin.statistics.trend` | 趋势 | Trend | 中 |
| `admin.statistics.app_ranking` | 应用排行 | App Ranking | 中 |
| `admin.statistics.model_dist` | 模型分布 | Model Distribution | 中 |
| `admin.statistics.export_csv` | 导出 CSV | Export CSV | 中 |

**用户/团队管理类**:
| Key | 中文 | 英文 | 频次 |
|-----|------|------|------|
| `admin.user.status` | 状态 | Status | 高 |
| `admin.user.balance` | 余额 | Balance | 中 |
| `admin.user.promotion_rate` | 分成比例 | Commission Rate | 中 |
| `admin.user.timezone` | 时区 | Timezone | 中 |
| `admin.user.active` | 活跃 | Active | 中 |
| `admin.user.inactive` | 未激活 | Inactive | 中 |
| `admin.user.password` | 密码 | Password | 中 |

> **注意**: 上表仅列出高/中频 key 示例。完整 key 列表将在实施阶段根据每个文件的实际中文文本进行汇总。
> 现有 `common.json` 中已有很多通用 key（如 `Delete`, `Edit`, `Confirm`, `Cancel`, `Detail` 等），可直接复用，无需重复添加。

### 阶段 4：组件中文文本替换为 i18n

这是最大工作量的阶段，需要逐个文件将硬编码中文替换为 `t('common:key')` 调用。

#### 4.1 替换优先级

| 优先级 | 文件数 | 中文数 | 建议 |
|--------|--------|--------|------|
| P0 - 页面文件 | 14 | ~400 | 全部替换 |
| P1 - 核心组件 | 12 | ~350 | 全部替换 |
| P2 - 统计组件 | 7 | ~240 | 全部替换 |
| P3 - 其他组件 | 39 | ~300 | 分批次替换 |

#### 4.2 替换模式

**组件内**（使用 `useTranslation`）:
```tsx
// 改前
<Button>添加用户</Button>
<Text>请登录管理员账号</Text>

// 改后
import { useTranslation } from 'next-i18next';
const { t } = useTranslation();

<Button>{t('common:admin.add_user')}</Button>
<Text>{t('common:admin.please_login')}</Text>
```

**`constants.ts` 中**（使用 `i18nT`）:
```typescript
// 已有此用法，修复 i18nT 即可
label: i18nT('dataset:process.Waiting'),
```

**工具函数中**（toast 等）:
```tsx
// toast 中的文本也需要使用 t()
toast({
  title: t('common:admin.login_success'),
  status: 'success'
});
```

#### 4.3 完整文件列表及变更预估

> 以下为按优先级排列的完整文件列表及新增 key 预估。

**P0 - 页面文件（14 个）**:

| # | 文件 | 中文数 | 新增 key 数 | 备注 |
|---|------|--------|------------|------|
| 1 | `pages/login/index.tsx` | 9 | 5 | 需要合并 gSSP |
| 2 | `pages/index.tsx` | 3 | 0 | 都是重定向，无 UI 文本 |
| 3 | `pages/_app.tsx` | 10 | 0 | 注释文本，无需翻译 |
| 4 | `pages/_error.tsx` | 3 | 2 | |
| 5 | `pages/dashboard/index.tsx` | 20 | 10 | |
| 6 | `pages/statistics/index.tsx` | 14 | 5 | 主要是注释 |
| 7 | `pages/tasks/index.tsx` | 53 | 25 | 大量任务表格文本 |
| 8 | `pages/tasks/[taskId].tsx` | 70 | 30 | 任务详情页 |
| 9 | `pages/user/list/index.tsx` | 42 | 20 | 用户管理页 |
| 10 | `pages/team/list/index.tsx` | 55 | 25 | 团队管理页 |
| 11 | `pages/dataset/list/index.tsx` | 0 (context.tsx: 2) | 3 | |
| 12 | `pages/dataset/detail/index.tsx` | 2 | 0 | |
| 13 | `pages/import-export/index.tsx` | 91 | 40 | 最大文件 |
| 14 | `pages/404.tsx` | 0 | 0 | |

**P1 - 核心组件（12 个）**:

| # | 文件 | 中文数 | 新增 key 数 |
|---|------|--------|------------|
| 1 | `components/tasks/TaskDetailDialog.tsx` | 89 | 35 |
| 2 | `components/tasks/TaskHistoryDialog.tsx` | 39 | 15 |
| 3 | `components/tasks/ExecuteTaskDialog.tsx` | 27 | 12 |
| 4 | `components/tasks/ExecutionCharts.tsx` | 26 | 10 |
| 5 | `components/LoginForm.tsx` | 8 | 4 |
| 6 | `components/dataset/list/List.tsx` | 19 | 8 |
| 7 | `components/dataset/list/CreateModal.tsx` | 2 | 1 |
| 8 | `components/dataset/list/SideTag.tsx` | 0 | 0（已有 useTranslation） |
| 9 | `components/dataset/EditFolderModal.tsx` | 0 | 0（已有 useTranslation） |
| 10 | `web/context/AuthContext.tsx` | 31 | 10 |
| 11 | `web/context/Layout/AdminSidebar.tsx` | 11 | 6 |
| 12 | `web/context/ProtectedRoute.tsx` | 3 | 1 |

**P2 - 统计组件（7 个）**:

| # | 文件 | 中文数 | 新增 key 数 |
|---|------|--------|------------|
| 1 | `components/statistics/FilterPanel.tsx` | 44 | 20 |
| 2 | `components/statistics/TrendChart.tsx` | 55 | 25 |
| 3 | `components/statistics/FilterDatePanel.tsx` | 15 | 8 |
| 4 | `components/statistics/ExportButton.tsx` | 43 | 18 |
| 5 | `components/statistics/StatusChart.tsx` | 35 | 15 |
| 6 | `components/statistics/ModelDistChart.tsx` | 34 | 12 |
| 7 | `components/statistics/OverviewCards.tsx` | 31 | 15 |

**P3 - 数据集组件（25 个）**:

| # | 文件 | 中文数 | 新增 key 数 |
|---|------|--------|------------|
| 1 | `components/dataset/detail/Form/CollectionChunkForm.tsx` | 55 | 25 |
| 2 | `components/dataset/detail/Info/index.tsx` | 30 | 15 |
| 3 | `components/dataset/detail/Import/Context.tsx` | 29 | 12 |
| 4 | `components/dataset/detail/CollectionCard/Header.tsx` | 28 | 10 |
| 5 | `components/dataset/detail/CollectionCard/index.tsx` | 18 | 8 |
| 6 | `components/dataset/detail/Test.tsx` | 15 | 8 |
| 7 | `components/dataset/detail/Import/commonProgress/Upload.tsx` | 15 | 6 |
| 8 | `components/dataset/detail/Import/commonProgress/PreviewData.tsx` | 7 | 4 |
| 9 | `components/dataset/detail/Import/commonProgress/DataProcess.tsx` | 6 | 4 |
| 10 | `components/dataset/detail/Import/diffSource/ImageDataset.tsx` | 8 | 5 |
| 11 | `components/dataset/detail/Import/diffSource/APIDataset.tsx` | 7 | 4 |
| 12 | `components/dataset/detail/Import/diffSource/FileLink.tsx` | 6 | 4 |
| 13 | `components/dataset/detail/Import/diffSource/FileCustomText.tsx` | 5 | 3 |
| 14 | `components/dataset/detail/Import/diffSource/ExternalFile.tsx` | 5 | 3 |
| 15 | `components/dataset/detail/Import/diffSource/FileLocal.tsx` | 2 | 1 |
| 16 | `components/dataset/detail/Import/components/FileSelector.tsx` | 10 | 5 |
| 17 | `components/dataset/detail/Import/components/FileSourceSelector.tsx` | 8 | 5 |
| 18 | `components/dataset/detail/Import/components/RenderFiles.tsx` | 5 | 2 |
| 19 | `components/dataset/detail/Info/components/EditApiServiceModal.tsx` | 4 | 3 |
| 20 | `components/dataset/detail/DataCard.tsx` | 10 | 5 |
| 21 | `components/dataset/detail/NavBar.tsx` | 3 | 2 |
| 22 | `components/dataset/ApiDatasetForm.tsx` | 3 | 2 |
| 23 | `components/dataset/detail/CollectionCard/Context.tsx` | 2 | 1 |
| 24 | `web/core/dataset/context/datasetPageContext.tsx` | 2 | 1 |
| 25 | `web/core/dataset/constants.ts` | 0 | 0（使用 i18nT，无需改） |

**P3 - 通用组件（14 个）**:

| # | 文件 | 中文数 | 新增 key 数 |
|---|------|--------|------------|
| 1 | `components/common/folder/SlideCard.tsx` | 6 | 4 |
| 2 | `components/common/folder/MoveModal.tsx` | 5 | 3 |
| 3 | `components/common/folder/Path.tsx` | 1 | 1 |
| 4 | `components/common/Modal/EditResourceModal.tsx` | 6 | 4 |
| 5 | `components/common/TableSkeleton.tsx` | 2 | 1 |
| 6 | `components/common/ComplianceTip/index.tsx` | 1 | 1 |
| 7 | `components/support/permission/MemberManager/context.tsx` | 4 | 3 |
| 8 | `components/support/permission/MemberManager/MemberListCard.tsx` | 1 | 1 |
| 9 | `components/support/permission/ResumeInheritText/index.tsx` | 4 | 2 |
| 10 | `components/support/permission/IconText.tsx` | 1 | 1 |
| 11 | `components/Select/AIModelSelector.tsx` | 3 | 3 |
| 12 | `components/core/dataset/RawSourceBox.tsx` | 1 | 1 |
| 13 | `components/Markdown/index.tsx` | 2 | 1 |
| 14 | `web/common/...` 杂项文件 | 2 | 2 |

### 阶段 5：验证与测试

#### 5.1 验证清单

- [ ] `next.config.js` 已包含 `i18n` 配置
- [ ] 所有页面都有 `getServerSideProps` 并调用 `serviceSideProps`
- [ ] `_app.tsx` 已有 `appWithTranslation` 包装 ✅（已完成）
- [ ] `next-i18next.config.js` 配置正确 ✅（已完成）
- [ ] 中文环境下所有页面文本正常显示
- [ ] 切换到英文后所有页面文本切换为英文
- [ ] 类型检查通过：`pnpm lint`
- [ ] 构建通过：`cd projects/admin && pnpm build`

#### 5.2 测试方法

1. 启动 admin 开发服务器
2. 浏览器默认语言访问，确认显示中文
3. 设置 `NEXT_LOCALE=en` cookie，确认显示英文
4. 逐一检查每个页面：登录页、首页/统计页、任务管理、任务详情、用户管理、团队管理、知识库列表、知识库详情、导入导出

## 实施顺序

```
阶段 1 (基础设施) → 阶段 2 (页面 gSSP) → 阶段 3 (新增翻译 key) → 阶段 4 (组件替换) → 阶段 5 (验证)
```

建议：阶段 1-3 一起做（基础设施 + 翻译 key），然后阶段 4 可以按优先级分 4 个 PR 提交：
- PR1: P0 页面文件 + 阶段 1-3
- PR2: P1 核心组件
- PR3: P2 统计组件
- PR4: P3 数据集 + 通用组件

## 风险与注意事项

1. **翻译 key 命名规范**: admin 专属 key 使用 `admin.` 前缀，避免与现有 key 冲突
2. **现有 key 复用**: 优先复用 `common.json` 中已有的通用 key（如 `Delete`、`Edit`、`Confirm`、`Cancel`），不要重复创建
3. **`dataset.json` 已有很多 key**: `dataset.json` 的 zh-CN 文件中已有 228 个 key，大部分数据集相关翻译可以直接复用
4. **构建影响**: 大量文件改动可能引起构建缓存失效，首次构建可能较慢
5. **`next-i18next` 版本**: admin 使用的 `next-i18next@15.4.2` 与 app 使用的版本一致
6. **localePath 配置**: admin 的 `localePath` 指向 `../../packages/web/i18n`，与 app 共享翻译文件
7. **注意区分**: 不要直接复用 app 的 `serviceSideProps`（路径 `@/web/common/i18n/utils`），admin 已有的 `@/web/i18n/utils` 是正确的
