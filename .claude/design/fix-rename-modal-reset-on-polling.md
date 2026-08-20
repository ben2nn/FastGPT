# 修复:训练状态轮询导致重命名弹窗输入被重置

## 问题现象

知识库存在训练/重建/增强任务时,在集合列表中打开"重命名"弹窗输入新名称,输入内容会周期性(约 3~6 秒)被清空重置,无法正常完成重命名。

相关接口:`GET /fastgpt_admin/api/core/dataset/training/getDatasetTrainingQueue`(每 3 秒轮询)

## 根因分析

问题由渲染链路中多个环节叠加导致:

```
训练队列轮询(3s,getDatasetTrainingQueue 计数变化)
  → DatasetPageContextProvider 重新渲染(contextValue 每次都是新对象)
    → CollectionCard 的 useContextSelector(DatasetPageContext, (v) => v) 选择整个对象
      → CollectionCard 每次 Provider 渲染都重新渲染
        → useEditTitle 中 EditModal 是每次渲染新建的函数组件(无 useCallback)
          → React 视为组件类型改变 → 弹窗子树 unmount + remount
            → Input 非受控(defaultValue) → 用户输入被重置为打开弹窗时的旧值
```

### 触发渲染的两条轮询路径

1. **3 秒轮询**:`DatasetPageContextProvider` 中
   `useQuery(['getDatasetTrainingQueue'], ..., { refetchInterval: 3000 })`
   训练/重建/增强计数变化时 data 引用变化 → Provider 渲染。
2. **6 秒轮询**:`CollectionCard` 中 ahooks `useRequest(pollingInterval: 6000)`:
   - 数据集状态非 active(训练中)时调用 `loadDatasetDetail` → `setDatasetDetail` → Provider 渲染;
   - 存在训练数据时调用 `getData(pageNum)` → CollectionPageContext value 变化 → CollectionCard 渲染。

### 关键 bug

`projects/admin/src/web/common/hooks/useEditTitle.tsx` 中 `EditModal` 为每次渲染新建的
函数组件(`const EditModal = ({...}) => {...}`),组件引用每次渲染都不同。
React 将 `<EditTitleModal />` 视为新组件类型,强制销毁并重建弹窗子树。
弹窗 Input 使用非受控 `defaultValue`,重建后以 `defaultValue.current`(打开弹窗时的
旧名称)重新初始化,用户正在输入的内容丢失,autoFocus 重新触发。

### 对照:上游已有修复

`projects/app/src/web/common/hooks/useEditTitle.tsx` 已用 `useCallback` 包裹
`EditModal`(依赖 `[isOpen, onClose, onclickConfirm, placeholder, t, tip, title]`,
弹窗打开期间全部稳定),不存在此问题。admin 为旧版代码,未同步该修复。

## 修复方案

### 核心修复:稳定 EditModal 组件引用

将 admin 的 `useEditTitle.tsx` 与上游 app 对齐,用 `useCallback` 包裹 `EditModal`。
保留 admin 版的差异(硬编码中文按钮文案"关闭"/"确认",无 useTranslation)。

```tsx
// eslint-disable-next-line react/display-name
const EditModal = useCallback(
  ({ maxLength = 50, iconSrc = 'modal/edit', closeBtnText = '关闭' }: {...}) => {
    const { runAsync, loading } = useRequest(onclickConfirm);
    return ( ... ); // 原有 JSX 不变
  },
  [isOpen, onClose, onclickConfirm, placeholder, tip, title]
);
```

依赖项在弹窗打开期间均稳定:
- `isOpen`:仅开关弹窗时变化;
- `onClose`:Chakra useDisclosure 返回的稳定引用;
- `onclickConfirm`:已 useCallback 包裹;
- `placeholder/tip/title`:外部传入的字符串 props。

效果:CollectionCard 因轮询渲染时,`<EditTitleModal />` 引用不变 → React 复用
弹窗子树 → 输入内容与焦点保留。

覆盖范围:同一 hook 也被 `Header.tsx`(创建手动集合弹窗)使用,一并受益。

### 附加修复 1:getDatasetTrainingQueue 的 queryKey 加入 datasetId

`useQuery(['getDatasetTrainingQueue'], () => getDatasetTrainingQueue(datasetId))` 的
queryKey 缺少 `datasetId`,切换到其他数据集时 React Query 会复用上一个数据集的
缓存计数,需等待下一次轮询才纠正。

```tsx
useQuery(['getDatasetTrainingQueue', datasetId], () => getDatasetTrainingQueue(datasetId), {
  refetchInterval: 3000
});
```

> 注:上游 app 项目同样存在此问题,本次仅修 admin。

### 附加修复 2(可选,性能优化):CollectionCard 的 context 选择器按字段选择

`useContextSelector(DatasetPageContext, (v) => v)` 选择整个对象,Provider 任何
字段变化都会渲染整个卡片列表。改为按字段选择:

```tsx
const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
const loadDatasetDetail = useContextSelector(DatasetPageContext, (v) => v.loadDatasetDetail);
```

注意:Provider 中 `loadDatasetDetail` 等函数未 useCallback 包裹,引用每次渲染都变,
按字段选择后仍会被动渲染,若要彻底优化需同步稳定 Provider 中的函数引用
(改动面较大,建议作为独立优化项评估)。

## 测试方案

1. **单元/行为测试**:
   - 测试 `useEditTitle` 返回的 `EditModal` 在无关状态变化时引用稳定
     (两次渲染引用相等);
   - 模拟弹窗打开后输入内容,父组件强制重渲染,断言输入内容保留。
2. **手工回归**:
   - 数据集存在训练任务时打开集合重命名弹窗,输入新名称,等待 10 秒以上
     (覆盖 3s/6s 两轮轮询周期),确认输入内容不再被清空;
   - 验证确认/取消/校验逻辑正常;
   - 验证 Header 的"创建手动集合"弹窗不受影响;
   - 切换数据集,确认训练队列计数正确(附加修复 1)。

## 变更文件

| 文件 | 变更 |
| --- | --- |
| `projects/admin/src/web/common/hooks/useEditTitle.tsx` | EditModal 用 useCallback 包裹(核心) |
| `projects/admin/src/web/core/dataset/context/datasetPageContext.tsx` | queryKey 加入 datasetId(附加 1) |
| `projects/admin/src/pageComponents/dataset/detail/CollectionCard/index.tsx` | (可选)selector 按字段选择(附加 2,未执行) |

## 执行记录(2026-08-20)

已按用户确认执行"核心修复 + 附加 1":

1. `useEditTitle.tsx`:EditModal 用 `useCallback` 包裹,依赖
   `[isOpen, onClose, onclickConfirm, placeholder, tip, title]`,与上游 app 对齐;
   保留 admin 版硬编码中文文案("关闭"/"确认")。
2. `datasetPageContext.tsx`:queryKey 改为 `['getDatasetTrainingQueue', datasetId]`。

验证结果:
- `tsc --noEmit`:两个修改文件无类型错误(项目存在与本次修改无关的既有错误)。
- ESLint:两个文件通过,无警告。
- admin 项目无前端测试基础设施(vitest/jest 仅覆盖 sandbox),自动化行为测试
  不适用;修复模式与上游 app 生产代码一致,已由上游验证。

待用户手工回归:
- 训练任务存在时打开集合重命名弹窗输入,等待 >10s(覆盖 3s/6s 轮询周期),
  确认输入不再被清空;
- 验证 Header"创建手动集合"弹窗、切换数据集后训练计数显示。
