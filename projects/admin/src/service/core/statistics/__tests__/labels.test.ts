/**
 * 模型类别/使用场景中文映射单元测试
 * 覆盖：三类模型类别映射、未知值原样返回、空值返回 '-'
 */

import {
  modelCategoryLabels,
  getModelCategoryLabel,
  getUsageScenarioLabel
} from '@/service/core/statistics/statistics';

describe('modelCategoryLabels / getModelCategoryLabel', () => {
  it('三类模型类别映射为中文', () => {
    expect(modelCategoryLabels).toEqual({
      chat: '对话',
      embedding: '向量',
      rerank: '重排'
    });
  });

  it('各取值返回对应中文', () => {
    expect(getModelCategoryLabel('chat')).toBe('对话');
    expect(getModelCategoryLabel('embedding')).toBe('向量');
    expect(getModelCategoryLabel('rerank')).toBe('重排');
  });

  it('未知取值原样返回', () => {
    expect(getModelCategoryLabel('voice')).toBe('voice');
  });

  it('空值返回 -', () => {
    expect(getModelCategoryLabel(undefined)).toBe('-');
    expect(getModelCategoryLabel(null)).toBe('-');
    expect(getModelCategoryLabel('')).toBe('-');
  });
});

describe('getUsageScenarioLabel - 回归', () => {
  it('知识库搜索场景映射存在（向量/重排记录的使用场景）', () => {
    expect(getUsageScenarioLabel('datasetSearchNode')).toBe('知识库搜索');
  });

  it('未知场景原样返回', () => {
    expect(getUsageScenarioLabel('customNode')).toBe('customNode');
  });
});
