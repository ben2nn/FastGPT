// 索引增强功能类型定义

// AI 配置索引模型
export type AIIndexConfig = {
  textModel: string;
  imageModel: string;
  vectorModel: string;
  chunkLimit: number; // 分块上限，默认 8000
};

// 增强配置（纯脚本逻辑，无用户配置项）
export type EnhanceRuleConfig = {
  aiIndexConfig: AIIndexConfig;
};

// 预览 API 请求/响应
export type EnhancePreviewBody = {
  datasetId: string;
  collectionIds?: string[];
};

export type EnhancePreviewRow = {
  originalQ: string;
  originalA: string;
  previewQ: string;
  previewA: string;
  previewIndexes: string[];
};

export type EnhancePreviewResponse = {
  totalChunks: number;
  previewRows: EnhancePreviewRow[];
};

// 执行 API 请求/响应
export type EnhanceIndexesBody = {
  datasetId: string;
  collectionIds?: string[];
  config?: EnhanceRuleConfig;
};

export type EnhanceIndexesResponse = {
  insertLen: number;
  billId: string;
};

// 快速测试 API 请求/响应
export type EnhanceQuickTestBody = {
  datasetId: string;
  collectionIds?: string[];
  config: EnhanceRuleConfig;
};

export type EnhanceQuickTestItem = {
  collectionName: string;
  articleTitle: string;
  suggestedKeywords: string[];
  previewQ: string;
};

export type EnhanceQuickTestResponse = {
  success: number;
  skipped: number;
  items: EnhanceQuickTestItem[];
};

// 取消 API 请求/响应
export type EnhanceCancelBody = {
  billId: string;
  datasetId: string;
};

export type EnhanceCancelResponse = {
  deletedCount: number;
};

// 默认配置
export const defaultAIIndexConfig: AIIndexConfig = {
  textModel: '',
  imageModel: '',
  vectorModel: '',
  chunkLimit: 8000
};

export const defaultEnhanceRuleConfig: EnhanceRuleConfig = {
  aiIndexConfig: defaultAIIndexConfig
};
