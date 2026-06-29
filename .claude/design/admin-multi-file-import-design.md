# 知识库模板导入/备份导入 - 多文件上传支持

## 1. 需求概述

Admin 项目中，知识库详情页"新建/导入"菜单下的"模板导入"和"备份导入"功能当前仅支持单文件上传（`maxCount={1}`），需要改造为支持多文件上传。

## 2. 现状分析

### 2.1 前端组件
| 文件 | 当前行为 |
|------|---------|
| [TemplateImportModal.tsx](projects/admin/src/pageComponents/dataset/detail/CollectionCard/TemplateImportModal.tsx) | `maxCount={1}`，单文件上传，`selectFiles[0].file` |
| [BackupImportModal.tsx](projects/admin/src/pageComponents/dataset/detail/CollectionCard/BackupImportModal.tsx) | `maxCount={1}`，单文件上传，`selectFiles[0].file` |
| [FileSelectorBox.tsx](projects/admin/src/components/Select/FileSelectorBox.tsx) | 通用文件选择器，已支持 `maxCount` 参数和多文件逻辑 |

### 2.2 前端 API
| 函数 | 当前签名 |
|------|---------|
| `postTemplateDatasetCollection` | `{ file: File, percentListen, datasetId }` — 单文件 |
| `postBackupDatasetCollection` | `{ file: File, percentListen, datasetId }` — 单文件 |

### 2.3 后端 API
| 路由 | 处理逻辑 |
|------|---------|
| [template.ts](projects/admin/src/pages/api/core/dataset/collection/create/template.ts) | `multer.resolveFormData` 解析单个文件 → 校验 CSV → 校验格式 → 上传 S3 → 创建集合 |
| [backup.ts](projects/admin/src/pages/api/core/dataset/collection/create/backup.ts) | 同上，`trainingType` 为 `backup` |

### 2.4 multer 层
- [multer.ts](packages/service/common/file/multer.ts) 的 `resolveFormData` 设计为处理**单个文件**
- `files` 存储在实例属性 `this.files` 上，每调用一次 `resolveFormData` 处理一个

## 3. 设计方案

### 3.1 策略选择：前端循环调用单文件 API

**方案**：不修改后端 API，前端循环遍历文件列表，逐个调用现有的单文件上传 API。

**理由**：
1. 后端每个文件创建一个独立的集合（collection），逐文件调用语义清晰
2. 不需要修改 multer 层和后端逻辑，改动最小
3. 可以精确追踪每个文件的上传进度和错误
4. 与现有 FileSelectorBox 组件的多文件选择能力天然兼容

### 3.2 前端改动

#### 3.2.1 TemplateImportModal.tsx

**改动要点**：
1. 移除 `maxCount={1}`，使用默认值（1000），或设置合理上限如 `maxCount={20}`
2. 修改 `onImport` 逻辑：循环遍历 `selectFiles`，逐个调用 `postTemplateDatasetCollection`
3. 增加多文件进度追踪：显示当前上传的文件索引和总进度
4. 导入过程中禁用文件选择和删除操作
5. 单个文件失败时记录错误，不中断其他文件上传
6. 上传完成后批量刷新列表

**进度显示策略**：
```
上传中... (2/5) - 当前文件 60%
```
- 进度文本从 `t('dataset:data_uploading', { num: percent })` 改为显示文件进度 + 单文件百分比

#### 3.2.2 BackupImportModal.tsx

与 TemplateImportModal 相同的改动模式：
1. 移除 `maxCount={1}`
2. 修改 `onBackupImport` 为多文件循环上传
3. 增加多文件进度追踪

### 3.3 API 层改动

#### 3.3.1 前端 API 函数

新增多文件版本的 API 函数（或修改现有函数支持多文件）：

```typescript
// 方案A：新增函数，保留原函数兼容性
export const postTemplateDatasetCollections = async ({
  files,
  datasetId,
  percentListen
}: {
  files: File[];
  datasetId: string;
  percentListen: (fileIndex: number, percent: number) => void;
}) => {
  for (let i = 0; i < files.length; i++) {
    await postTemplateDatasetCollection({
      datasetId,
      file: files[i],
      percentListen: (percent) => percentListen(i, percent)
    });
  }
};
```

**推荐方案 A**：保留原单文件函数不动，新增多文件包装函数。这样不影响其他调用方。

#### 3.3.2 后端 API

**不需要修改**。每个文件独立调用现有接口。

### 3.4 UI/UX 设计

#### 文件选择区域
- 移除 `maxCount={1}` 限制
- FileSelectorBox 组件本身已支持多文件选择和拖拽，无需额外改动

#### 文件列表
- 已有文件列表渲染逻辑支持多文件，无需改动
- 导入进行中时，列表项显示各文件的上传状态

#### 进度显示
- 总进度：`正在导入 (2/5)...`
- 当前文件进度：`文件名.csv - 60%`
- 全部完成：显示成功 toast

#### 错误处理
- 单个文件失败：记录错误信息，继续上传后续文件
- 全部完成后，如果有失败的文件，在 toast 或弹窗中显示失败详情
- 失败的文件可重新选择上传

### 3.5 国际化

需要新增/修改的 i18n key：
- `dataset:uploading_file_progress` — `正在导入 ({{current}}/{{total}})...`

## 4. 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `projects/admin/src/pageComponents/dataset/detail/CollectionCard/TemplateImportModal.tsx` | **修改** | 移除 maxCount=1，改为多文件循环上传，增加进度追踪 |
| `projects/admin/src/pageComponents/dataset/detail/CollectionCard/BackupImportModal.tsx` | **修改** | 同上 |
| `projects/admin/src/web/core/dataset/api.ts` | **修改** | 新增多文件版本的 API 函数 |
| 国际化文件 | **修改** | 新增多文件上传进度的翻译 key |

## 5. 不需要改动的文件

| 文件 | 原因 |
|------|------|
| `FileSelectorBox.tsx` | 已支持 maxCount 和多文件逻辑 |
| `template.ts` / `backup.ts` (后端) | 每个文件独立调用，无需改动 |
| `multer.ts` | 单文件解析不变 |

## 6. 测试计划

### 6.1 单元测试
- 多文件选择后，文件列表正确显示
- 删除单个文件不影响其他文件
- 导入按钮在无文件时禁用

### 6.2 集成测试
- 选择 3+ 个 CSV 文件进行模板导入，验证全部创建成功
- 选择 3+ 个 CSV 文件进行备份导入，验证全部创建成功
- 上传过程中验证进度显示正确
- 混合场景：部分文件格式不正确，验证错误处理
- 知识库列表刷新后确认所有集合已创建

### 6.3 边界测试
- 选择超过 maxCount 限制的文件数量
- 文件名包含特殊字符（中文、空格、emoji）
- 重复上传相同文件
- 上传过程中关闭弹窗
