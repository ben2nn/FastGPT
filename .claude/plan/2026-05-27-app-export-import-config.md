# App 导入导出配置扩展 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展 App 导入导出功能，将 OutLink（免登录窗口+门户配置）和 OpenApi（API 访问 Key）一并导出/导入。

**Architecture:** 在现有导出 JSON 结构上扩展，版本从 1.0 升级到 2.0，新增 outLinks 和 openApis 数组字段。导入时兼容 v1.0（缺失字段跳过）。apiKey 通过 keepApiKey 参数控制是否保留原值。

**Tech Stack:** NextJS API Routes, Mongoose, TypeScript

---

## 涉及文件

| 文件 | 操作 | 职责 |
|------|------|------|
| `projects/admin/src/pages/api/extend/app/exportByParentId.ts` | 修改 | App 导出：增加 outLinks/openApis 查询 |
| `projects/admin/src/pages/api/extend/app/importFromJson.ts` | 修改 | App 导入：增加 outLinks/openApis 写入 |
| `projects/admin/src/pages/api/extend/tool/exportTools.ts` | 修改 | 工具导出：增加 outLinks/openApis 查询 |
| `projects/admin/src/pages/api/extend/tool/importTools.ts` | 修改 | 工具导入：增加 outLinks/openApis 写入 |

---

### Task 1: 修改 App 导出接口 exportByParentId.ts

**Files:**
- Modify: `projects/admin/src/pages/api/extend/app/exportByParentId.ts`

- [ ] **Step 1: 添加 MongoOutLink 和 MongoOpenApi 导入**

在文件顶部 import 区域添加：

```typescript
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
```

- [ ] **Step 2: 从请求体中解析 keepApiKey 参数**

将第 49 行 `const { parentId } = req.body;` 替换为：

```typescript
const { parentId, keepApiKey } = req.body as { parentId?: string; keepApiKey?: boolean };
```

- [ ] **Step 3: 查询 outLinks 和 openApis 数据**

在第 75 行 `// 7. 查询版本数据` 之前，添加：

```typescript
// 查询关联的 OutLink（免登录窗口 + 门户配置）
const outLinks = await MongoOutLink.find({ appId: { $in: appIds } })
  .select('-teamId -tmbId -usagePoints -lastTime')
  .lean();

// 查询关联的 OpenApi（API 访问 Key）
const openApiProjection: Record<string, number> = {
  teamId: 0,
  tmbId: 0,
  usagePoints: 0,
  lastUsedTime: 0,
  createTime: 0
};
if (!keepApiKey) {
  openApiProjection.apiKey = 0;
}
const openApis = await MongoOpenApi.find({ appId: { $in: appIds } })
  .select(openApiProjection)
  .lean();
```

- [ ] **Step 4: 更新导出数据结构**

将第 81-88 行的 `const exportData = {...}` 替换为：

```typescript
const exportData = {
  version: '2.0',
  type: 'app',
  exportTime: new Date().toISOString(),
  teamId,
  apps,
  versions,
  outLinks,
  openApis
};
```

- [ ] **Step 5: 提交**

```bash
git add projects/admin/src/pages/api/extend/app/exportByParentId.ts
git commit -m "feat(export): include outLinks and openApis in app export"
```

---

### Task 2: 修改 App 导入接口 importFromJson.ts

**Files:**
- Modify: `projects/admin/src/pages/api/extend/app/importFromJson.ts`

- [ ] **Step 1: 添加导入**

在文件顶部 import 区域添加：

```typescript
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
```

- [ ] **Step 2: 解析 keepApiKey 参数**

将第 50 行 `const { file, keepOriginalId, targetParentId } = req.body;` 替换为：

```typescript
const { file, keepOriginalId, targetParentId, keepApiKey } = req.body as {
  file: unknown;
  keepOriginalId?: boolean;
  targetParentId?: string;
  keepApiKey?: boolean;
};
```

- [ ] **Step 3: 更新版本校验兼容 v1.0 和 v2.0**

将第 65 行 `if (importData.version !== '1.0' || importData.type !== 'app')` 替换为：

```typescript
if (!['1.0', '2.0'].includes(importData.version) || importData.type !== 'app') {
```

- [ ] **Step 4: 解析 outLinks 和 openApis**

在第 69 行 `const { apps, versions } = importData;` 之后添加：

```typescript
const outLinks: Record<string, unknown>[] = importData.outLinks || [];
const openApis: Record<string, unknown>[] = importData.openApis || [];
```

- [ ] **Step 5: 更新数据量限制检查**

将第 81 行 `const totalDocs = apps.length + versions.length;` 替换为：

```typescript
const totalDocs = apps.length + versions.length + outLinks.length + openApis.length;
```

- [ ] **Step 6: 为 outLinks 和 openApis 生成 ID 映射**

将第 94 行 `const allDocs = [...apps, ...versions];` 替换为：

```typescript
const allDocs = [...apps, ...versions, ...outLinks, ...openApis];
```

- [ ] **Step 7: 处理 outLinks 和 openApis 文档**

在第 134-141 行的 `const updatedVersions = versions.map(...)` 块之后添加：

```typescript
const updatedOutLinks = outLinks.map((doc: Record<string, unknown>) => {
  const updated = { ...doc };
  updated._id = updateId(String(doc._id));
  if (updated.appId) {
    updated.appId = updateId(String(updated.appId));
  }
  updated.teamId = teamId;
  updated.tmbId = tmbId;
  return updated;
});

const updatedOpenApis = openApis.map((doc: Record<string, unknown>) => {
  const updated = { ...doc };
  updated._id = updateId(String(doc._id));
  if (updated.appId) {
    updated.appId = updateId(String(updated.appId));
  }
  updated.teamId = teamId;
  updated.tmbId = tmbId;
  if (!keepApiKey) {
    const nanoid = getNanoid(Math.floor(Math.random() * 14) + 52);
    updated.apiKey = `fastgpt-${nanoid}`;
  }
  updated.createTime = new Date();
  updated.usagePoints = 0;
  return updated;
});
```

- [ ] **Step 8: 更新 batchInsert 调用和返回结果**

将第 174-177 行的 `const [appsCount, versionsCount] = await Promise.all([...])` 替换为：

```typescript
const [appsCount, versionsCount, outLinksCount, openApisCount] = await Promise.all([
  batchInsert(MongoApp, updatedApps, 'apps'),
  batchInsert(MongoAppVersion, updatedVersions, 'versions'),
  updatedOutLinks.length > 0
    ? batchInsert(MongoOutLink, updatedOutLinks, 'outLinks')
    : Promise.resolve(0),
  updatedOpenApis.length > 0
    ? batchInsert(MongoOpenApi, updatedOpenApis, 'openApis')
    : Promise.resolve(0)
]);
```

将第 180-186 行的返回结果替换为：

```typescript
res.status(200).json({
  success: true,
  data: {
    appsCount,
    versionsCount,
    outLinksCount,
    openApisCount,
    ...(duplicateWarnings.length > 0 ? { warnings: duplicateWarnings } : {})
  }
});
```

- [ ] **Step 9: 提交**

```bash
git add projects/admin/src/pages/api/extend/app/importFromJson.ts
git commit -m "feat(import): import outLinks and openApis with app data"
```

---

### Task 3: 修改工具导出接口 exportTools.ts

**Files:**
- Modify: `projects/admin/src/pages/api/extend/tool/exportTools.ts`

- [ ] **Step 1: 添加导入**

在文件顶部 import 区域添加：

```typescript
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
```

- [ ] **Step 2: 解析 keepApiKey 参数**

将第 47 行 `const { parentId } = req.body;` 替换为：

```typescript
const { parentId, keepApiKey } = req.body as { parentId?: string; keepApiKey?: boolean };
```

- [ ] **Step 3: 查询 outLinks 和 openApis**

在第 119 行 `const versions = await MongoAppVersion.find(...)` 之后、`const exportData = {...}` 之前添加：

```typescript
const outLinks = await MongoOutLink.find({ appId: { $in: appIds } })
  .select('-teamId -tmbId -usagePoints -lastTime')
  .lean();

const openApiProjection: Record<string, number> = {
  teamId: 0,
  tmbId: 0,
  usagePoints: 0,
  lastUsedTime: 0,
  createTime: 0
};
if (!keepApiKey) {
  openApiProjection.apiKey = 0;
}
const openApis = await MongoOpenApi.find({ appId: { $in: appIds } })
  .select(openApiProjection)
  .lean();
```

- [ ] **Step 4: 更新导出数据结构**

将第 123-130 行的 `const exportData = {...}` 替换为：

```typescript
const exportData = {
  version: '2.0',
  type: 'tool',
  exportTime: new Date().toISOString(),
  teamId,
  apps,
  versions,
  outLinks,
  openApis
};
```

同时将第 95-102 行的空数据返回替换为：

```typescript
return res.status(200).json({
  version: '2.0',
  type: 'tool',
  exportTime: new Date().toISOString(),
  teamId,
  apps: [],
  versions: [],
  outLinks: [],
  openApis: []
});
```

- [ ] **Step 5: 提交**

```bash
git add projects/admin/src/pages/api/extend/tool/exportTools.ts
git commit -m "feat(export): include outLinks and openApis in tool export"
```

---

### Task 4: 修改工具导入接口 importTools.ts

**Files:**
- Modify: `projects/admin/src/pages/api/extend/tool/importTools.ts`

- [ ] **Step 1: 添加导入**

在文件顶部 import 区域添加：

```typescript
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
```

- [ ] **Step 2: 解析 keepApiKey 参数**

将第 46 行 `const { file, keepOriginalId, targetParentId } = req.body;` 替换为：

```typescript
const { file, keepOriginalId, targetParentId, keepApiKey } = req.body as {
  file: unknown;
  keepOriginalId?: boolean;
  targetParentId?: string;
  keepApiKey?: boolean;
};
```

- [ ] **Step 3: 更新版本校验**

将第 62 行 `if (importData.version !== '1.0' || importData.type !== 'tool')` 替换为：

```typescript
if (!['1.0', '2.0'].includes(importData.version) || importData.type !== 'tool') {
```

- [ ] **Step 4: 解析 outLinks 和 openApis**

在第 66 行 `const { apps, versions } = importData;` 之后添加：

```typescript
const outLinks: Record<string, unknown>[] = importData.outLinks || [];
const openApis: Record<string, unknown>[] = importData.openApis || [];
```

- [ ] **Step 5: 更新数据量限制检查**

将第 89 行 `const totalDocs = apps.length + versions.length;` 替换为：

```typescript
const totalDocs = apps.length + versions.length + outLinks.length + openApis.length;
```

- [ ] **Step 6: 扩展 ID 映射范围**

将第 101 行 `const allDocs = [...apps, ...versions];` 替换为：

```typescript
const allDocs = [...apps, ...versions, ...outLinks, ...openApis];
```

- [ ] **Step 7: 处理 outLinks 和 openApis 文档**

在第 140-146 行的 `const updatedVersions = versions.map(...)` 块之后添加：

```typescript
const updatedOutLinks = outLinks.map((doc: Record<string, unknown>) => {
  const updated = { ...doc };
  updated._id = updateId(String(doc._id));
  if (updated.appId) {
    updated.appId = updateId(String(updated.appId));
  }
  updated.teamId = teamId;
  updated.tmbId = tmbId;
  return updated;
});

const updatedOpenApis = openApis.map((doc: Record<string, unknown>) => {
  const updated = { ...doc };
  updated._id = updateId(String(doc._id));
  if (updated.appId) {
    updated.appId = updateId(String(updated.appId));
  }
  updated.teamId = teamId;
  updated.tmbId = tmbId;
  if (!keepApiKey) {
    const nanoid = getNanoid(Math.floor(Math.random() * 14) + 52);
    updated.apiKey = `fastgpt-${nanoid}`;
  }
  updated.createTime = new Date();
  updated.usagePoints = 0;
  return updated;
});
```

- [ ] **Step 8: 更新 batchInsert 调用和返回结果**

将第 179-182 行的 `const [appsCount, versionsCount] = await Promise.all([...])` 替换为：

```typescript
const [appsCount, versionsCount, outLinksCount, openApisCount] = await Promise.all([
  batchInsert(MongoApp, updatedApps, 'apps'),
  batchInsert(MongoAppVersion, updatedVersions, 'versions'),
  updatedOutLinks.length > 0
    ? batchInsert(MongoOutLink, updatedOutLinks, 'outLinks')
    : Promise.resolve(0),
  updatedOpenApis.length > 0
    ? batchInsert(MongoOpenApi, updatedOpenApis, 'openApis')
    : Promise.resolve(0)
]);
```

将第 184-190 行的返回结果替换为：

```typescript
res.status(200).json({
  success: true,
  data: {
    appsCount,
    versionsCount,
    outLinksCount,
    openApisCount,
    ...(duplicateWarnings.length > 0 ? { warnings: duplicateWarnings } : {})
  }
});
```

- [ ] **Step 9: 提交**

```bash
git add projects/admin/src/pages/api/extend/tool/importTools.ts
git commit -m "feat(import): import outLinks and openApis with tool data"
```

---

### Task 5: 验证

- [ ] **Step 1: TypeScript 编译检查**

```bash
cd projects/admin && npx tsc --noEmit 2>&1 | head -30
```

Expected: 无新增类型错误。

- [ ] **Step 2: 最终提交**

```bash
git add -A
git commit -m "feat: complete app export/import with outLink and openApi config support"
```
