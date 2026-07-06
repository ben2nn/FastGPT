# 工作流导入目标位置类型判断设计

## 问题描述

备份还原页面"工作流"tab 还原时，"目标位置"可能是目录也可能是工作流，但当前 API：
1. 将 `targetId` 直接作为 `parentId`，若目标是工作流则产生错误的层级关系
2. 未检测重复，可能产生意外数据

## 设计方案

### 核心逻辑

仅区分 `targetType` 是否为 `folder`：

| targetType | 含义 | 处理方式 |
|------------|------|----------|
| `'folder'` | 目标是目录 | `targetId` 作为 `parentId`，走原有插入逻辑 |
| 非 `'folder'` | 目标是工作流 | 按 `_id` 查找，**已存在则报错提示删除，不存在则正常插入** |

> 注：`targetType` 非 `'folder'` 且 `targetId` 不存在的场景极少发生（用户从树形选择器选中时 app 必然存在），此场景下按原有逻辑正常插入，`parentId` 保持导入数据中的原始值。

### 涉及文件（共 3 个）

#### 1. `projects/admin/src/pages/api/extend/app/importFromJson.ts`

**请求参数**（将 `targetParentId` 改为 `targetId`，新增 `targetType`）：

```typescript
const { file, keepOriginalId, targetId, targetType, keepApiKey } = req.body;
// targetId: string | undefined
// targetType: 'folder' | string | undefined
```

**处理流程**：

```typescript
if (targetType === 'folder' && targetId) {
  // 目录：作为 parentId，走原有 insertMany 逻辑
  updatedApps.forEach(app => { app.parentId = targetId; });
  // ... 原有 batchInsert 逻辑不变
} else if (targetId && targetType !== 'folder') {
  // 工作流：按 _id 查找是否已存在
  const existingApp = await MongoApp.findOne({ _id: targetId, teamId });
  if (existingApp) {
    // 已存在 → 报错，提示用户先删除
    return res.status(409).json({
      success: false,
      error: `目标工作流「${existingApp.name}」已存在，请先删除后再导入`
    });
  }
  // 不存在 → 走原有 batchInsert 逻辑（parentId 保持导入数据原始值）
} else {
  // 无 targetId：根目录，走原有 batchInsert 逻辑
}
```

#### 2. `projects/admin/src/web/core/extend/api.ts`

参数名从 `targetParentId` 改为 `targetId`，新增 `targetType`：

```typescript
export const importApp = async (
  file: string | object,
  keepOriginalId: boolean,
  targetId?: string,
  targetType?: string
) => {
  const response = await authFetch(getWebReqUrl('/api/extend/app/importFromJson'), {
    method: 'POST',
    body: JSON.stringify({ file, keepOriginalId, targetId, targetType })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '工作流导入失败');
  }
  return response.json();
};
```

#### 3. `projects/admin/src/pages/import-export/index.tsx`

**3a. TAB_CONFIGS 字段 key 修改**：

```typescript
// 工作流 tab 的 importFields
{ key: 'targetId', label: '目标位置', placeholder: '留空则导入到根目录', type: 'appSelect', filterType: 'workflow' }

// 工具 tab 的 importFields
{ key: 'targetId', label: '目标位置', placeholder: '留空则导入到根目录', type: 'appSelect', filterType: 'tool' }
```

**3b. TabContent 新增状态**：

```typescript
const [selectedTargetType, setSelectedTargetType] = useState<string>('');
```

**3c. FieldInput 组件新增 `onTargetTypeChange` 回调**（仅 `appSelect` 类型使用）：

```typescript
// FieldInput props 新增
onTargetTypeChange?: (type: string) => void;

// appSelect 分支改为
<AppTreeSelect
  value={value}
  onChange={(id: string, type: string) => {
    onChange(id);
    onTargetTypeChange?.(type);
  }}
  placeholder={field.placeholder}
  fetchList={getAppList}
  filterType={field.filterType}
/>
```

**3d. TabContent 中 FieldInput 调用处传递回调**：

```typescript
{config.importFields?.map((field) => (
  <FieldInput
    key={field.key}
    field={field}
    value={fieldValues[field.key] || ''}
    onChange={(v) => setField(field.key, v)}
    onTargetTypeChange={field.type === 'appSelect' ? setSelectedTargetType : undefined}
  />
))}
```

**3e. 导入调用传入 targetType**：

```typescript
// 读取字段名改为 targetId
const targetId = fieldValues.targetId?.trim();

// case 1 调用改为
result = await importApp(text, keepOriginalId, targetId || undefined, selectedTargetType || undefined);
```

### 返回结果

成功时（无重复）：
```typescript
{ success: true, data: { appsCount, versionsCount, outLinksCount, openApisCount } }
```

冲突时（409）：
```typescript
{ success: false, error: "目标工作流「xxx」已存在，请先删除后再导入" }
```

## 实施步骤

1. 修改 `importFromJson.ts` — 参数名 `targetParentId` → `targetId`，新增 `targetType`，重复检测报错
2. 修改 `api.ts` — 参数名 `targetParentId` → `targetId`，新增 `targetType`
3. 修改 `index.tsx` — TAB_CONFIGS key 改名、新增 `selectedTargetType` 状态、FieldInput 传递 type 回调、导入调用传参
4. 测试验证
