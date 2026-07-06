// 增强配置缓存管理
// 用于在 enhanceIndexes API 和 generateEnhanceIndex 队列处理器之间传递配置

import type { EnhanceRuleConfig } from '@/pageComponents/dataset/detail/IndexEnhance/types';

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
