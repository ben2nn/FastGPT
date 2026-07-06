# 索引增强功能设计（完整版）

## 1. 功能概述

索引增强是 FastGPT Admin 中数据集管理的核心功能，用于对已有知识库数据进行 **Q-A-Index 三字段结构**的批量优化，提升向量检索和关键词检索的召回率与准确性。

### 1.1 核心价值

| 问题 | 解决方案 |
|------|---------|
| 导入时未开启自动索引，Q 字段只是原文片段 | AI 重新生成语义化 Q 字段（摘要 + 模拟提问） |
| 缺少关键词索引，精确查询匹配差 | 生成 Index 字段（口语化检索词/标签） |
| A 字段缺乏上下文（无标题、无来源） | 补充上下文头（知识标题 + 类型 + 来源） |
| 法规引用关系丢失，跨条检索困难 | 识别引用关系，生成合并语义块 |

### 1.2 三字段数据模型

详见 [knowledge-q-a-index-structure.md](knowledge-q-a-index-structure.md)

| 字段 | 定位 | 内容 |
|------|------|------|
| **Q** | 检索问句 | 知识标题 + 知识类型 + 标签 + 1-2 个 AI 模拟提问 |
| **A** | 主体答案 | 切片标题 + 知识类型 + 标签 + 切片正文 + 原文链接 |
| **Index** | 辅助索引 | 标签（与 Q 中标签重复，用于关键词检索） |

---

## 2. 功能架构

### 2.1 整体流程

```
┌──────────────────────────────────────────────────────────────────┐
│ Header: 标题 + 工作原理(ℹ️ hover) + AI额度警告                   │
├──────────────────────┬───────────────────────────────────────────┤
│ 左侧面板 (30%)       │ 右侧面板 (70%)                            │
│                      │                                           │
│ ① 集合列表（树形选择）│ ② 生成配置（AI模型/Q&A&Index模板）        │
│ ② 训练进度（队列状态）│ ③ 补充配置（知识类型/领域上下文）          │
│                      │ ④ 操作按钮（预览/快速测试/开始增强/取消）   │
│                      │ ⑤ 预览表格（点击预览后替换配置区显示）      │
└──────────────────────┴───────────────────────────────────────────┘
```

### 2.2 页面布局设计

沿用现有 admin 的左右分栏风格。**注意**：与当前 `IndexEnhance.tsx` 相比，左右面板做了交换——集合树从右侧移到左侧（30%），配置区从左侧移到右侧（70%），使配置区有更多空间展示 Q/A/Index 三组模板。

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [🤖 索引增强 ℹ️]                                              [⚠️ 会消耗AI额度] │
│      ↑hover弹出工作原理Popover                                         │
├──────────────────────────────────────────────────────────────────────────┤
│                        │                                                │
│  左侧面板 (30%)        │  右侧面板 (70%)                                 │
│                        │                                                │
│  ┌─ 集合列表 ──────┐  │  ┌─ 生成配置 ──────────────────────────────┐  │
│  │                   │  │  │                                          │  │
│  │ ☑ 整个数据集     │  │  │ ── AI 配置索引模型 ──                   │  │
│  │ ▼ 📁 数据安全法  │  │  │                                          │  │
│  │   📄 第一章 总则  │  │  │ 文本理解: [当前数据集模型 ▼]            │  │
│  │   📄 第二章...   │  │  │ 图片理解: [当前数据集模型 ▼]            │  │
│  │ ▼ 📁 市场主体    │  │  │ 索引模型: [当前数据集模型 ▼] 分块上限:[8000] │  │
│  │   📄 第一章 总则  │  │  │                                          │  │
│  │   📄 第一章 总则  │  │  │ ── Q 字段模板 ──                        │  │
│  │   ...            │  │  │ ☑标题 ☑类型 ☑标签 提问:[2]              │  │
│  └───────────────────┘  │  │                                          │  │
│                        │  │ ── A 字段模板 ──                        │  │
│  ┌─ 训练进度 ──────┐  │  │ ☑上下文头 ☑标签 ☑来源链接               │  │
│  │ 🔵 增强中 12条  │  │  │                                          │  │
│  │ 总队列:45 重建:3 │  │  │ ── Index 字段模板 ──                    │  │
│  └───────────────────┘  │  │ ☑标签  分隔符:[;▼]                      │  │
│                        │  │                                          │  │
│                        │  │ ── 补充配置 ──                          │  │
│                        │  │ 知识类型 [输入知识类型__________]        │  │
│                        │  │ 领域上下文 [________________________]    │  │
│                        │  │                                          │  │
│                        │  │ ──────────────────────────────────────── │  │
│                        │  │ [👁 预览] [⚡ 快速测试] [🚀 开始增强] [⏹取消]│  │
│                        │  └──────────────────────────────────────────┘  │
│                        │                                                │
│                        │  (点击"预览"后，配置区折叠为预览表格，          │
│                        │   关闭预览后恢复配置区)                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**布局说明**：

| 区域 | 位置 | 内容 |
|------|------|------|
| Header | 顶部横条 | 标题 + 问号图标（hover 弹出工作原理）+ AI 额度提示 |
| 左侧 - 集合列表 | 左面板上部 | 树形目录 + 复选框选择（复用现有样式） |
| 左侧 - 训练进度 | 左面板底部 | 训练队列状态（复用现有样式） |
| 右侧 - 生成配置 | 右面板上部 | AI 配置索引模型、Q/A/Index 字段模板、补充配置（知识类型、领域上下文）、操作按钮 |
| 右侧 - 预览 | 右面板（替换配置区） | 点击"预览"后配置区折叠，预览表格占据整个右侧，关闭后恢复配置区 |

**四个操作按钮说明**：

| 按钮 | 行为 | 消耗额度 |
|------|------|---------|
| 👁 预览 | 用模板填充 Q/A/Index，不调用 AI，不写入数据 | ❌ |
| ⚡ 快速测试 | 处理选中范围的前 5 条，调用 AI 生成并写入训练队列，完成后提示已处理的条目信息，并引导前往"搜索测试"验证 | ✅ 少量 |
| 🚀 开始增强 | 处理选中范围的全部数据，调用 AI 生成并写入训练队列 | ✅ 全量 |
| ⏹ 取消 | 终止正在进行的增强任务（增强运行时显示） | - |

**交互流程**：

1. 用户在右侧配置区设置规则（AI 模型、Q/A/Index 模板、知识类型、领域上下文）
2. 在左侧集合列表中勾选目标范围
3. 点击配置区底部的操作按钮：
   - **预览** → 配置区折叠，右侧展示预览对比表格（原始 vs 新 Q/A/Index），关闭后恢复配置区
   - **快速测试** → 处理前 5 条，完成后 Toast 展示：
     - ✅ 成功 4 条，跳过 1 条
     - 已处理条目摘要（如"第三章 第二十一条~第二十五条"）
     - 推荐搜索关键词（如"数据安全义务"、"数据收集"）
     - [前往搜索测试验证] 按钮，点击跳转
   - **开始增强** → 左侧训练进度自动刷新，完成后 Toast 通知

---

## 3. 规则配置模块

### 3.1 知识类型

手动输入文本框，用户自行填写。以下为常见类型的参考：

| 知识类型 | 适用场景 | AI 生成风格 |
|---------|---------|------------|
| 法律法规 | 法律条文、管理办法 | 正式、严谨，引用条号 |
| 行业标准 | 技术规范、行业准则 | 专业术语，标准编号 |
| 操作手册 | 使用说明、操作指南 | 步骤化、口语化 |
| 通知公告 | 政策通知、公告 | 简明扼要 |

> 输入的知识类型会传入 AI Prompt，影响 Q 字段的生成风格和 Index 标签的语义方向。

### 3.2 Q 字段模板

可勾选的组件 + 顺序排列：

```typescript
type QTemplateConfig = {
  components: Array<{
    type: 'title' | 'type' | 'tags' | 'simulatedQuestions';
    enabled: boolean;
  }>;
  questionCount: number;  // 模拟提问数量，1-5，默认 2
};
```

示例输出：
```
Q: "《数据安全法》第二十七条 类型：法律法规 标签：数据安全、合规 企业如何合法收集数据？"
     ^^^^^^标题^^^^^^   ^^类型^^   ^^标签^^         ^^^^^模拟提问^^^^^
```

### 3.3 A 字段模板

```typescript
type ATemplateConfig = {
  contextHeader: 'title_chapter_article' | 'title_article' | 'none';
  includeTags: boolean;
  includeSourceLink: boolean;
  tagSeparator: '、' | ',' | ';';
};
```

示例输出：
```
A: "【中华人民共和国数据安全法 | 第三章 数据安全义务 | 第二十七条】
    类型：法律法规
    标签：数据安全、合规、企业义务
    任何组织、个人收集数据，应当采取合法、正当的方式...
    来源：https://example.com/data-security-law#chapter3"
```

### 3.4 Index 字段模板

```typescript
type IndexTemplateConfig = {
  separator: ';' | '、' | ',';   // 标签分隔符，默认 ;
  includeType: boolean;          // 是否在 Index 中包含知识类型
  includeChapter: boolean;       // 是否在 Index 中包含章节名
};
```

示例输出：
```
Index: "数据安全;合规;企业义务;数据分类分级;第三章 数据安全义务"
```

Index 字段用于关键词/BM25 检索，标签由 AI 根据切片内容独立生成。可选配置：
- **分隔符**：影响 FastGPT 内部的标签解析，默认 `;`
- **包含知识类型**：如"法律法规"加入 Index，增强类型维度的精确匹配
- **包含章节名**：如"第三章 数据安全义务"加入 Index，增强结构化检索

### 3.5 领域上下文提示

> **设计说明**：标签是切片级的（每条数据的标签应不同），不适合全局手动添加。用户真正需要的是告诉 AI 这批数据的**领域背景**，让 AI 为每条切片独立生成最相关的标签。

```typescript
type DomainContextConfig = {
  domainContext: string;  // 领域上下文描述，帮助 AI 理解业务背景
};
```

示例：
```
领域上下文："网络安全与数据保护领域，面向企业合规人员"
```

交互：
- 多行文本输入框，placeholder 给出示例引导
- 非必填，留空则 AI 仅根据切片内容生成标签
- 填写后会传入 AI Prompt 的 `## 领域背景` 段落，影响标签的语义方向

**为什么不用手动标签**：
- 手动标签是全局的，会统一应用到所有切片，导致无关切片被污染
- 标签应该是切片级的，由 AI 根据每条切片内容独立生成
- 领域上下文提示可以让 AI 在正确的语义方向上生成标签，而不引入噪声

### 3.6 AI 配置索引模型

直接引用当前数据集的模型配置，支持下拉切换：

```typescript
type AIIndexConfig = {
  textModel: string;         // 文本理解模型，默认取数据集 agentModel
  imageModel: string;        // 图片理解模型，默认取数据集 vlmModel（可选）
  vectorModel: string;       // 索引模型，默认取数据集 vectorModel
  chunkLimit: number;        // 索引模型的分块上限，默认 8000（超过此长度的切片跳过）
};
```

交互：
- **文本理解模型**：默认显示当前数据集的 agentModel 名称，点击可下拉切换
- **图片理解模型**：默认显示当前数据集的 vlmModel 名称（如果数据集配置了 VLM），点击可下拉切换
- **索引模型**：默认显示当前数据集的 vectorModel 名称，点击可下拉切换（用于向量化 Q/A/Index 内容）
- **分块上限**：显示在索引模型右侧，数字输入框，默认 8000，超过此长度的切片跳过不处理

---

## 4. 四种操作模式

配置区底部提供四个操作按钮，各调用独立 API：

| 按钮 | API 调用 | 参数 | 行为 |
|------|---------|------|------|
| 👁 预览 | `enhancePreview` | - | 模板填充，不调用 AI，不写入数据 |
| ⚡ 快速测试 | `enhanceQuickTest` | limit=5 | 同步调用 AI 处理前 5 条，返回结果详情 |
| 🚀 开始增强 | `enhanceIndexes` | - | 写入 enhance 训练队列，异步处理全部数据 |
| ⏹ 取消 | `enhanceCancel` | billId | 删除本次增强的 pending 训练任务 |

---

## 5. 后端实现

### 5.1 API 设计

#### 5.1.1 预览 API

**路径**: `POST /core/dataset/training/enhancePreview`

```typescript
async function handler(req: ApiRequestProps<enhancePreviewBody>) {
  const { datasetId, collectionId, limit = 20 } = req.body;

  const { teamId } = await authDataset({ req, datasetId, per: ReadPermissionVal });

  // 查询已有数据
  const query: any = { teamId, datasetId };
  if (collectionId) query.collectionId = collectionId;

  const dataList = await MongoDatasetData.find(query)
    .sort({ chunkIndex: 1 })
    .limit(limit)
    .lean();

  // 用模板填充 Q/A/Index（不调用 AI）
  const previewRows = dataList.map(data => ({
    originalQ: data.q,
    originalA: data.a || '',
    previewQ: buildTemplateQ(data, req.body),
    previewA: buildTemplateA(data, req.body),
    previewIndexes: buildTemplateIndexes(data, req.body),
  }));

  const totalCount = await MongoDatasetData.countDocuments(query);

  return { totalChunks: totalCount, previewRows };
}
```

#### 5.1.2 执行 API

**路径**: `POST /core/dataset/training/enhanceIndexes`

> **设计决策**：复用现有的 `mode=enhance` 训练队列 + `generateEnhanceIndex` 处理器，不绕过现有管道。只自定义 Prompt 和参数。

```typescript
type enhanceIndexesResponse = {
  insertLen: number;  // 写入训练队列的条数
};

async function handler(req: ApiRequestProps<enhanceIndexesBody>) {
  const { datasetId, collectionIds } = req.body;

  // 鉴权（匹配现有模式）
  const { teamId, tmbId } = await authDataset({
    req, authToken: true, authApiKey: true,
    datasetId, per: WritePermissionVal
  });

  // 1. 检查是否正在训练
  const training = await MongoDatasetTraining.findOne({ teamId, datasetId });
  if (training) {
    return Promise.reject('数据集正在训练中，请稍后再试');
  }

  // 2. 查询待增强数据（分批查询，避免内存溢出）
  const query: any = { teamId, datasetId };
  if (collectionIds?.length) query.collectionId = { $in: collectionIds };

  const totalCount = await MongoDatasetData.countDocuments(query);
  if (totalCount === 0) {
    return Promise.reject('选中范围内没有数据');
  }

  // 3. 创建账单
  const { usageId } = await createTrainingUsage({
    teamId, tmbId, appName: '索引增强', billSource: UsageSourceEnum.training,
  });

  // 4. 缓存配置（供 generateEnhanceIndex 异步读取）
  setEnhanceConfig(datasetId, req.body);

  // 5. 分批写入 enhance 训练队列（复用现有管道）
  let insertLen = 0;
  const batchSize = 500;

  for (let skip = 0; skip < totalCount; skip += batchSize) {
    const dataList = await MongoDatasetData.find(query)
      .sort({ chunkIndex: 1 })
      .skip(skip)
      .limit(Math.min(batchSize, totalCount - skip))
      .lean();

    for (const data of dataList) {
      // 跳过超长切片
      if (data.q.length > (req.body.chunkLimit || 8000)) continue;

      // 清除已有的 summary/question 类型索引，避免重复
      const existingIndexes = (data.indexes || []).filter(
        idx => idx.type !== DatasetDataIndexTypeEnum.summary
            && idx.type !== DatasetDataIndexTypeEnum.question
      );

      await MongoDatasetTraining.create([{
        teamId, tmbId, datasetId,
        collectionId: data.collectionId,
        billId: usageId,
        mode: TrainingModeEnum.enhance,  // 使用现有的 enhance 模式
        q: data.q,
        a: data.a,
        chunkIndex: data.chunkIndex,
        dataId: String(data._id),        // 引用已有数据
        indexes: existingIndexes,         // 保留非 summary/question 索引
        retryCount: 50,
      }]);
      insertLen++;
    }
  }

  // 5. 触发 enhance 队列处理（MongoDB watch 自动触发 generateEnhanceIndex）

  return { insertLen };
}
```

#### 5.1.3 进度追踪（复用现有机制）

> **设计变更**：不再自建进度系统，复用现有的训练队列进度追踪。

进度通过 `DatasetPageContext` 的以下字段获取（现有机制）：
- `enhanceCount`：enhance 模式队列中待处理的任务数
- `trainingCount`：所有训练队列的任务总数
- `rebuildingCount`：重建队列的任务数

进度面板显示：
```
增强队列: {enhanceCount} 条    总训练队列: {trainingCount}    重建队列: {rebuildingCount}
```

当 `enhanceCount === 0 && trainingCount === 0` 时，增强完成。

#### 5.1.4 配置缓存管理

`generateEnhanceIndex` 队列处理器异步执行时需要读取用户的配置（knowledgeType、domainContext、qTemplate 等），通过内存 Map 缓存传递：

```typescript
// enhanceConfigCache.ts
const configMap = new Map<string, EnhanceRuleConfig>();

export function setEnhanceConfig(datasetId: string, config: EnhanceRuleConfig) {
  configMap.set(datasetId, config);
}

export function getEnhanceConfig(datasetId: string): EnhanceRuleConfig | undefined {
  return configMap.get(datasetId);
}

export function clearEnhanceConfig(datasetId: string) {
  configMap.delete(datasetId);
}
```

**生命周期管理**：

| 操作 | set 时机 | get 时机 | clear 时机 |
|------|---------|---------|-----------|
| **快速测试** | 不需要缓存 | 不需要缓存 | 不需要缓存 |
| **开始增强** | `enhanceIndexes` API 写入训练任务前 | `generateEnhanceIndex` 处理每条任务时 | 所有 enhance 任务处理完成 或 用户取消 |
| **取消** | - | - | `enhanceCancel` API 中调用 clear |

**详细流程**：

```
快速测试（同步，无需缓存）：
  API handler 直接接收 config → 调用 AI → 返回结果 → config 随请求结束释放

开始增强（异步，需要缓存）：
  API handler → setEnhanceConfig(datasetId, config)
             → 写入训练任务
             → 返回 insertLen
             → generateEnhanceIndex 异步处理：
                 config = getEnhanceConfig(datasetId)
                 if (!config) 回退到默认配置（数据集 agentModel + 默认模板）
                 用 config 构建 Prompt → 调用 AI → 写入结果
             → 最后一条任务处理完成 → clearEnhanceConfig(datasetId)

取消：
  enhanceCancel API → deleteMany(训练任务) + clearEnhanceConfig(datasetId)
```

**并发保护**：现有检查 `MongoDatasetTraining.findOne({ teamId, datasetId })` 已阻止重复启动，不会出现两个配置同时写入的情况。

**缓存未命中回退**：如果服务重启导致缓存丢失，`generateEnhanceIndex` 读取不到配置，使用默认值：
- 知识类型：空（AI 自动判断）
- 领域上下文：空
- Q 模板：默认（标题 + 类型 + 标签 + 2 个提问）
- A 模板：默认（上下文头 + 标签 + 来源链接）

#### 5.1.5 取消 API

**路径**: `POST /core/dataset/training/enhanceCancel`

```typescript
type enhanceCancelBody = {
  billId: string;     // 账单 ID，用于定位本次增强写入的训练任务
  datasetId: string;  // 用于清除配置缓存
};

async function handler(req: ApiRequestProps<enhanceCancelBody>) {
  const { billId, datasetId } = req.body;

  // 1. 删除本次增强写入的所有 pending 训练任务
  const result = await MongoDatasetTraining.deleteMany({ billId });

  // 2. 清除配置缓存
  clearEnhanceConfig(datasetId);

  // 3. 可选：回滚账单

  return { deletedCount: result.deletedCount };
}
```

**关键设计**：通过 `billId` 精确定位并清理本次增强的训练任务，持久化到 MongoDB，不依赖内存状态。服务重启后仍可通过 `billId` 清理。

### 5.2 核心服务：generateEnhanceIndex Prompt 定制

> **设计决策**：不新建独立的增强服务，复用现有的 `generateEnhanceIndex` 队列处理器。仅通过自定义 Prompt 实现 Q-A-Index 三字段生成。

现有的 `generateEnhanceIndex` 处理流程：
1. 从 `MongoDatasetTraining` 读取 `mode=enhance` 任务
2. 获取 `dataId` 对应的原始数据
3. 调用 LLM 生成 summary + questions
4. 写入新的 indexes，推入 `mode=chunk` 向量化队列

需要改造的部分：**步骤 3 的 Prompt**，从生成 summary + questions 改为生成 Q-A-Index 三字段。

改造后的 Prompt 设计见 5.3 节。

### 5.3 AI 生成 Prompt 设计

```typescript
function buildEnhancePrompt(
  config: enhanceIndexesBody,
  data: { q: string; a: string }
): string {
  const { knowledgeType, domainContext, qTemplate } = config;

  // 构建 Q 字段要求
  const qRequirements = [];
  if (qTemplate.components.find(c => c.type === 'title' && c.enabled))
    qRequirements.push('知识标题');
  if (qTemplate.components.find(c => c.type === 'type' && c.enabled))
    qRequirements.push('知识类型');
  if (qTemplate.components.find(c => c.type === 'tags' && c.enabled))
    qRequirements.push('相关标签');
  qRequirements.push(`${qTemplate.questionCount} 个模拟提问`);

  return `你是一名知识库索引生成专家。根据以下切片内容，生成检索问句(Q)和检索标签(Indexes)。

## 要求
- Q 字段：包含 ${qRequirements.join(' + ')}，总长度控制在 1-2 句话，保持精简聚焦
- Indexes：6-10 个口语化检索词，用英文分号 ; 分隔
- 模拟提问应贴近用户真实口语化表达

## 知识类型
${knowledgeType}

${domainContext ? `## 领域背景\n${domainContext}\n` : ''}
## 切片内容
${data.a || data.q}

## 输出格式（纯 JSON，不要 markdown 标记）
{"q": "检索问句", "indexes": "检索词1;检索词2;检索词3"}`;
}
```

### 5.4 快速测试 API（同步执行）

**路径**: `POST /core/dataset/training/enhanceQuickTest`

> 快速测试只处理 5 条，耗时可控（~10 秒），直接在 API 内同步调用 AI，不走队列，这样能直接返回结果详情。

```typescript
type enhanceQuickTestBody = {
  datasetId: string;
  collectionIds?: string[];
  // Q/A/Index 模板配置、AI 配置等（同 enhanceIndexesBody）
};

type enhanceQuickTestResponse = {
  success: number;
  skipped: number;
  items: Array<{
    collectionName: string;       // 所属集合名
    articleTitle: string;         // 切片标题
    suggestedKeywords: string[];  // AI 生成的标签（推荐搜索关键词）
    previewQ: string;             // AI 生成的 Q
  }>;
};

async function handler(req: ApiRequestProps<enhanceQuickTestBody>) {
  const { datasetId, collectionIds } = req.body;

  const { teamId, tmbId } = await authDataset({
    req, authToken: true, authApiKey: true,
    datasetId, per: WritePermissionVal
  });

  // 1. 读取前 5 条数据
  const query: any = { teamId, datasetId };
  if (collectionIds?.length) query.collectionId = { $in: collectionIds };

  const dataList = await MongoDatasetData.find(query)
    .sort({ chunkIndex: 1 }).limit(5).lean();

  if (dataList.length === 0) {
    return Promise.reject('选中范围内没有数据');
  }

  // 2. 创建账单
  const { usageId } = await createTrainingUsage({
    teamId, tmbId, appName: '索引增强-快速测试', billSource: UsageSourceEnum.training,
  });

  // 3. 逐条调用 AI 生成 Q + Indexes，A 字段用规则拼接上下文头
  const items: enhanceQuickTestResponse['items'] = [];
  let success = 0, skipped = 0;

  for (const data of dataList) {
    if (data.q.length > (req.body.chunkLimit || 8000)) { skipped++; continue; }

    try {
      // 调用 AI 生成 Q + Indexes
      const prompt = buildEnhancePrompt(req.body, data);
      const result = await callLLM(client, req.body.aiIndexConfig, prompt);
      const { q, indexes } = parseEnhanceResult(result);

      if (!q) { skipped++; continue; }

      // A 字段用规则拼接上下文头（不调用 AI）
      const newA = buildAnswerWithContext(data, req.body.aTemplate);

      // 清除已有 summary/question 索引
      const existingIndexes = (data.indexes || []).filter(
        idx => idx.type !== DatasetDataIndexTypeEnum.summary
            && idx.type !== DatasetDataIndexTypeEnum.question
      );

      // 写入 enhance 训练队列
      await MongoDatasetTraining.create([{
        teamId, tmbId, datasetId,
        collectionId: data.collectionId,
        billId: usageId,
        mode: TrainingModeEnum.enhance,
        q: q, a: newA,
        chunkIndex: data.chunkIndex,
        dataId: String(data._id),
        indexes: existingIndexes,
        retryCount: 50,
      }]);

      // 收集结果详情
      const collection = await MongoDatasetCollection.findById(data.collectionId).lean();
      items.push({
        collectionName: collection?.name || '未知集合',
        articleTitle: extractArticleTitle(data.q),
        suggestedKeywords: indexes,
        previewQ: q,
      });
      success++;
    } catch {
      skipped++;
    }
  }

  return { success, skipped, items };
}
```

### 5.5 A 字段上下文头生成规则

A 字段的上下文头**不调用 AI**，使用规则拼接，更稳定可靠：

```typescript
function buildAnswerWithContext(
  data: { q: string; a: string },
  aTemplate: ATemplateConfig
): string {
  const originalA = data.a || data.q;

  if (aTemplate.contextHeader === 'none') return originalA;

  // 从原始数据中提取结构信息
  const title = extractTitle(data.q);       // 如 "中华人民共和国数据安全法"
  const chapter = extractChapter(data.q);   // 如 "第三章 数据安全义务"
  const article = extractArticle(data.q);   // 如 "第二十七条"

  let header = '';
  if (aTemplate.contextHeader === 'title_chapter_article') {
    header = [title, chapter, article].filter(Boolean).join(' | ');
  } else if (aTemplate.contextHeader === 'title_article') {
    header = [title, article].filter(Boolean).join(' | ');
  }

  const parts = [];
  if (header) parts.push(`【${header}】`);
  parts.push(originalA);
  if (aTemplate.includeSourceLink && data.sourceUrl) {
    parts.push(`来源：${data.sourceUrl}`);
  }

  return parts.join('\n');
}
```

### 5.6 generateEnhanceIndex Prompt 改造要点

现有 `generateEnhanceIndex` 处理器需要改造的**最小改动**：

1. 从训练任务的 `indexes` 字段读取配置（或通过数据集配置传递）
2. 将 Prompt 从 `SUMMARY + Q1-Q5` 改为 5.3 节的 JSON 格式
3. 将 AI 返回的 `q` 写入数据的 `q` 字段，`indexes` 写入 `indexes` 数组
4. A 字段保持原值（上下文头已在 API 写入训练任务时拼接好）

> **注意**：`generateEnhanceIndex` 的批量处理和回退机制保持不变（现有的按序匹配 + 逐条回退逻辑已经足够）。

---

## 6. 前端组件设计

### 6.1 组件结构

```
IndexEnhance/
├── index.tsx                    # 主页面组件（左30%集合 + 右70%配置&结果）
├── RuleConfig.tsx               # 右侧：生成配置区
│   ├── AIIndexModelConfig.tsx   # AI 配置索引模型（文本/图片模型+分块上限）
│   ├── QTemplateConfig.tsx      # Q 字段模板配置
│   ├── ATemplateConfig.tsx      # A 字段模板配置
│   ├── IndexTemplateConfig.tsx  # Index 字段模板配置
│   └── DomainContextInput.tsx   # 领域上下文输入（补充配置）
├── HowItWorks.tsx               # 工作原理（Header ℹ️ hover 弹出）
├── CollectionTree.tsx           # 左侧：集合树形列表（从现有 IndexEnhance.tsx 提取）
├── TrainingProgress.tsx         # 左侧：训练进度（从 DatasetPageContext 读取 enhanceCount 等）
├── PreviewTable.tsx             # 右侧：预览表格（点击"预览"后替换配置区显示）
└── types.ts                     # 类型定义
```

### 6.2 主页面组件

沿用现有 `IndexEnhance.tsx` 的 `Flex h="100%" flexDirection="column"` 布局：

```tsx
const IndexEnhance = ({ datasetId }: { datasetId: string }) => {
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  // 规则配置
  const [ruleConfig, setRuleConfig] = useState<EnhanceRuleConfig>(defaultRuleConfig);
  // 执行状态
  const [execMode, setExecMode] = useState<'idle' | 'preview' | 'running' | 'done' | 'error'>('idle');
  const [previewData, setPreviewData] = useState<EnhancePreviewResponse | null>(null);
  // 集合选择（复用现有逻辑）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // 四个操作
  const handlePreview = () => { /* 调用 enhancePreview API，成功后 setExecMode('preview') */ };
  const handleQuickTest = async () => {
    /* 调用 enhanceQuickTest API（同步，返回结果详情） */
    const result = await postEnhanceQuickTest({ datasetId, collectionIds: ... });
    /* result: { success, skipped, items: [{ collectionName, articleTitle, suggestedKeywords, previewQ }] } */
    toast({
      status: 'success',
      title: '快速测试完成',
      duration: 15000,
      render: () => (
        <Box>
          <Text fontWeight="bold" mb={1}>
            ✅ 成功 {result.success} 条，跳过 {result.skipped} 条
          </Text>
          <Text fontSize="sm" color="myGray.600" mb={1}>
            已处理：{result.items.map(i => i.articleTitle).join('、')}
          </Text>
          <Text fontSize="sm" color="myGray.500" mb={2}>
            推荐搜索：{result.items[0]?.suggestedKeywords?.join('、') || '查看生成的标签'}
          </Text>
          <Button size="sm" colorScheme="blue"
            onClick={() => router.push({ query: { ...router.query, currentTab: 'test' } })}>
            前往搜索测试验证
          </Button>
        </Box>
      ),
    });
  };
  const handleEnhance = () => { /* 调用 enhanceIndexes API，写入 enhance 训练队列 */ };
  const handleCancel = () => { /* 调用 enhanceCancel API */ };

  return (
    <Flex h="100%" flexDirection="column">
      {/* ===== Header：标题 + 额度提示 ===== */}
      <Flex px={6} py={3} alignItems="center" justifyContent="space-between"
        borderBottom="1px solid" borderColor="myGray.200">
        <Flex alignItems="center">
          <MyIcon name="core/app/aiLight" w="20px" mr={2} color="primary.600" />
          <Text fontSize="md" fontWeight="bold">索引增强</Text>
          <MyPopover trigger="hover" content={<HowItWorks />}>
            <QuestionTip ml={2} label="" />
          </MyPopover>
        </Flex>
        <Box px={3} py={1.5} borderRadius="md" bg="yellow.50" border="1px solid" borderColor="yellow.200">
          <Text fontSize="xs" color="yellow.700">增强会消耗 AI 额度</Text>
        </Box>
      </Flex>

      {/* ===== 内容：左右分栏 ===== */}
      <Flex flex={1} overflow="hidden">
        {/* 左侧：集合列表 + 训练进度 */}
        <Box w="30%" display="flex" flexDirection="column" overflow="hidden"
          borderRight="1px solid" borderColor="myGray.200">
          {/* 集合树形列表 */}
          <CollectionTree datasetId={datasetId} selectedIds={selectedIds}
            selectAll={selectAll} onToggleSelect={setSelectedIds} onToggleSelectAll={setSelectAll} />

          {/* 训练进度 */}
          <TrainingProgress />
        </Box>

        {/* 右侧：生成配置 或 预览（互斥切换） */}
        <Box w="70%" overflow="auto" p={6}>
          {execMode === 'preview' && previewData ? (
            <PreviewTable data={previewData} onClose={() => setExecMode('idle')} />
          ) : (
            <RuleConfig value={ruleConfig} onChange={setRuleConfig} />
          )}
        </Box>
      </Flex>
    </Flex>
  );
};
```

### 6.3 RuleConfig 组件

```tsx
const RuleConfig = ({ value, onChange }: {
  value: EnhanceRuleConfig;
  onChange: (config: EnhanceRuleConfig) => void;
}) => {
  return (
    <Box mb={6} p={4} borderWidth={1} borderRadius="md">
      <Heading size="sm" mb={4}>生成配置</Heading>

      {/* AI 配置索引模型（置顶） */}
      <AIIndexModelConfig
        value={value.aiIndexConfig}
        datasetDetail={datasetDetail}
        onChange={(v) => onChange({ ...value, aiIndexConfig: v })}
      />

      {/* Q 字段模板 */}
      <QTemplateConfig
        value={value.qTemplate}
        onChange={(v) => onChange({ ...value, qTemplate: v })}
      />

      {/* A 字段模板 */}
      <ATemplateConfig
        value={value.aTemplate}
        onChange={(v) => onChange({ ...value, aTemplate: v })}
      />

      {/* Index 字段模板 */}
      <IndexTemplateConfig
        value={value.indexTemplate}
        onChange={(v) => onChange({ ...value, indexTemplate: v })}
      />

      {/* 补充配置 */}
      <Divider my={3} />
      <Text fontSize="xs" color="myGray.400" mb={2}>补充配置（填了效果更好）</Text>

      <Flex gap={4} mb={3}>
        <Box flex={1}>
          <Text fontSize="sm" mb={1}>知识类型</Text>
          <Input size="sm" placeholder="输入知识类型，如：法律法规、行业标准"
            value={value.knowledgeType}
            onChange={(e) => onChange({ ...value, knowledgeType: e.target.value })} />
        </Box>
      </Flex>

      <DomainContextInput
        value={value.domainContext}
        onChange={(v) => onChange({ ...value, domainContext: v })}
      />

      {/* 操作按钮 */}
      <Divider my={4} />
      <Flex gap={3}>
        <Button size="sm" variant="outline" flex={1}
          leftIcon={<MyIcon name="common/eye" w="14px" />}
          onClick={onPreview}
          isDisabled={execMode === 'running'}
          isLoading={execMode === 'preview'}>
          预览
        </Button>
        <Button size="sm" variant="outline" colorScheme="blue" flex={1}
          leftIcon={<MyIcon name="common/running" w="14px" />}
          onClick={onQuickTest}
          isDisabled={execMode === 'running'}
          isLoading={execMode === 'running'}>
          快速测试
        </Button>
        <Button size="sm" colorScheme="blue" flex={1}
          leftIcon={<MyIcon name="common/running" w="14px" />}
          onClick={onEnhance}
          isDisabled={execMode === 'running'}
          isLoading={execMode === 'running'}>
          {selectedCount > 0 ? `增强选中 ${selectedCount} 个` : '开始增强'}
        </Button>
        {execMode === 'running' && (
          <Button size="sm" variant="outline" colorScheme="red" flex={1}
            leftIcon={<MyIcon name="common/closeLight" w="14px" />}
            onClick={onCancel}>
            取消
          </Button>
        )}
      </Flex>
    </Box>
  );
};
```

### 6.4 DomainContextInput 组件

```tsx
const DomainContextInput = ({ value, onChange }: {
  value: string;
  onChange: (v: string) => void;
}) => {
  return (
    <Box mb={4}>
      <Text fontSize="sm" fontWeight="bold" mb={2}>
        领域上下文
        <Text as="span" fontWeight="normal" color="gray.500" ml={2}>
          （可选，帮助 AI 理解业务背景，生成更精准的切片级标签）
        </Text>
      </Text>
      <Textarea
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="例：网络安全与数据保护领域，面向企业合规人员"
        rows={2}
      />
    </Box>
  );
};
```

### 6.5 PreviewTable 组件

```tsx
const PreviewTable = ({ data, onClose }: { data: EnhancePreviewResponse; onClose: () => void }) => {
  return (
    <Box>
      <Flex mb={2} alignItems="center" justifyContent="space-between">
        <Heading size="sm">
          预览结果（共 {data.totalChunks} 条，展示前 {data.previewRows.length} 条）
        </Heading>
        <Button size="xs" variant="ghost" onClick={onClose}>关闭预览</Button>
      </Flex>
      <Table size="sm" variant="striped">
        <Thead>
          <Tr>
            <Th w="5%">#</Th>
            <Th w="20%">原始 Q</Th>
            <Th w="25%">新 Q（预览）</Th>
            <Th w="20%">新 A（预览）</Th>
            <Th w="15%">新 Indexes</Th>
            <Th w="15%">对比</Th>
          </Tr>
        </Thead>
        <Tbody>
          {data.previewRows.map((row, idx) => (
            <Tr key={idx}>
              <Td>{idx + 1}</Td>
              <Td>
                <Text fontSize="xs" noOfLines={3}>{row.originalQ}</Text>
              </Td>
              <Td>
                <Text fontSize="xs" color="blue.600" noOfLines={3}>{row.previewQ}</Text>
              </Td>
              <Td>
                <Text fontSize="xs" noOfLines={3}>{row.previewA}</Text>
              </Td>
              <Td>
                <Wrap>
                  {row.previewIndexes.map((tag) => (
                    <Tag key={tag} size="sm" colorScheme="green">{tag}</Tag>
                  ))}
                </Wrap>
              </Td>
              <Td>
                <Badge colorScheme={row.originalQ !== row.previewQ ? 'orange' : 'gray'}>
                  {row.originalQ !== row.previewQ ? '有变化' : '无变化'}
                </Badge>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
};
```

> **说明**：增强进度通过左侧"训练进度"面板展示（复用现有样式），右侧不再单独显示进度条。

---

## 7. 文件清单

### 7.1 新增文件

| 文件路径 | 说明 |
|---------|------|
| `projects/admin/src/pageComponents/dataset/detail/IndexEnhance/index.tsx` | 主页面组件（左右分栏） |
| `projects/admin/src/pageComponents/dataset/detail/IndexEnhance/RuleConfig.tsx` | 生成配置区 |
| `projects/admin/src/pageComponents/dataset/detail/IndexEnhance/AIIndexModelConfig.tsx` | AI 配置索引模型 |
| `projects/admin/src/pageComponents/dataset/detail/IndexEnhance/IndexTemplateConfig.tsx` | Index 字段模板 |
| `projects/admin/src/pageComponents/dataset/detail/IndexEnhance/HowItWorks.tsx` | 工作原理（Popover） |
| `projects/admin/src/pageComponents/dataset/detail/IndexEnhance/PreviewTable.tsx` | 预览表格 |
| `projects/admin/src/pageComponents/dataset/detail/IndexEnhance/CollectionTree.tsx` | 集合树形列表（从现有 IndexEnhance.tsx 提取） |
| `projects/admin/src/pageComponents/dataset/detail/IndexEnhance/TrainingProgress.tsx` | 训练进度（复用 DatasetPageContext） |
| `projects/admin/src/pageComponents/dataset/detail/IndexEnhance/DomainContextInput.tsx` | 领域上下文输入 |
| `projects/admin/src/pageComponents/dataset/detail/IndexEnhance/types.ts` | 类型定义 |
| `projects/admin/src/pages/api/core/dataset/training/enhancePreview.ts` | 预览 API（新增） |
| `projects/admin/src/pages/api/core/dataset/training/enhanceIndexes.ts` | 执行 API（改造现有） |
| `projects/admin/src/pages/api/core/dataset/training/enhanceQuickTest.ts` | 快速测试 API（新增，同步执行） |
| `projects/admin/src/pages/api/core/dataset/training/enhanceCancel.ts` | 取消 API（新增） |
| `projects/admin/src/service/core/dataset/queues/generateEnhanceIndex.ts` | 改造 Prompt（现有文件） |
| `projects/admin/src/service/core/dataset/enhanceConfigCache.ts` | 配置缓存管理（新增） |

### 7.2 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `projects/admin/src/pageComponents/dataset/detail/NavBar.tsx` | 已有 indexEnhance tab，无需修改 |
| `projects/admin/src/pages/dataset/detail/index.tsx` | 已有 IndexEnhance 动态导入，无需修改 |

---

## 8. 实施步骤

### Phase 1：规则配置 + 预览
1. 创建 `types.ts` 类型定义
2. 实现 `RuleConfig` 组件（AI 配置、Q/A/Index 模板、补充配置）
3. 实现 `enhancePreview` API（模板填充，不调用 AI）
4. 实现 `PreviewTable` 组件
5. 组装 `IndexEnhance/index.tsx` 主页面（提取现有集合树 + 训练进度）

### Phase 2：增强执行 + Prompt 定制
6. 改造 `enhanceIndexes` API（添加 config 参数，分批写入 enhance 队列）
7. 改造 `generateEnhanceIndex` Prompt（使用 Q-A-Index 模板生成）
8. 实现 `enhanceCancel` API（通过 billId 清理训练队列）
9. 实现快速测试 Toast（含已处理条目详情 + 跳转引导）

### Phase 3：优化完善
10. Token 估算与成本提示
11. 错误处理与重试
12. 配置持久化（保存到数据集配置）

---

## 9. 验证方式

### 9.1 预览验证
1. 进入"索引增强" tab，配置规则
2. 点击"预览"，验证模板填充结果
3. 检查 Q 字段是否精简聚焦、A 字段是否自包含、Indexes 是否包含领域相关标签

### 9.2 快速测试验证
1. 勾选一个集合作为目标，点击"快速测试"
2. 等待 Toast 结果展示（成功/跳过条目、推荐搜索关键词）
3. 点击 Toast 中的"前往搜索测试验证"按钮
4. 在搜索测试中输入推荐关键词验证增强效果
5. 满意后再点击"开始增强"处理全部数据

### 9.3 全量增强验证
1. 点击"开始增强"，观察左侧训练进度面板
2. 完成后在数据详情中验证 Q/A/Index 三字段
3. 使用搜索测试对比增强前后的检索效果

### 9.4 领域上下文验证
1. 填写领域上下文 "网络安全与数据保护领域，面向企业合规人员"
2. 运行增强，验证 AI 生成的标签是否偏向该领域
3. 对比填写/不填写领域上下文时，标签质量的差异
4. 使用领域相关关键词搜索验证命中率提升
