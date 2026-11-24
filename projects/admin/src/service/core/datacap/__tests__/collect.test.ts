/**
 * 数据提取服务拆行采集单元测试
 * 覆盖：知识库搜索节点拆行(向量/重排/搜索内 LLM)、call_id 子键、状态判定、积分/耗时记法、
 *       既有 chat 行为回归(单行、无子键)
 * Mongo 模型全部 mock,不连接数据库
 */

jest.mock('@fastgpt/service/common/system/log', () => ({
  addLog: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() }
}));

jest.mock('@fastgpt/service/core/chat/chatItemSchema', () => ({
  MongoChatItem: {
    find: jest.fn(),
    aggregate: jest.fn()
  }
}));

jest.mock('@fastgpt/service/core/chat/chatItemResponseSchema', () => ({
  MongoChatItemResponse: { countDocuments: jest.fn() }
}));

jest.mock('@fastgpt/service/core/chat/constants', () => ({
  ChatItemResponseCollectionName: 'chat_item_responses',
  chatCollectionName: 'chats'
}));

jest.mock('@fastgpt/service/core/app/schema', () => ({
  AppCollectionName: 'apps'
}));

jest.mock('@fastgpt/service/core/app/version/schema', () => ({
  AppVersionCollectionName: 'app_versions'
}));

import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { DataCapCollect } from '@/service/core/datacap/collect';

const mockFind = MongoChatItem.find as jest.Mock;
const mockAggregate = MongoChatItem.aggregate as jest.Mock;

/**
 * 构造 find 链式调用与 aggregate 返回值,驱动 extractCallLogs 走完单批次
 */
function mockBatch(docs: any[]) {
  // _id 必须是合法 ObjectId hex(extractBatch 会显式转 ObjectId 作为游标)
  const items = docs.map((_, i) => ({ _id: i.toString(16).padStart(24, '0') }));
  mockFind.mockReturnValue({
    sort: () => ({
      limit: () => ({
        lean: async () => items
      })
    })
  });
  // collect.ts 以 MongoChatItem.aggregate(pipeline).exec() 执行聚合
  mockAggregate.mockReturnValue({
    exec: async () => docs
  });
}

/** 搜索节点响应文档(启用重排 + 搜索内问题优化 + 深度搜索) */
function makeSearchDoc(overrides: Record<string, any> = {}): any {
  return {
    callId: 'resp-1',
    appId: 'app1',
    appName: '客服应用',
    moduleType: 'datasetSearchNode',
    callTimestamp: new Date('2026-01-01T08:00:00Z'),
    chatId: 'chat1',
    dataId: 'data1',
    embeddingModel: 'text-embedding-3-large',
    embeddingTokens: 100,
    rerankModel: 'bge-reranker-v2',
    reRankInputTokens: 50,
    queryExtensionResult: { model: 'gpt-4o-mini', inputTokens: 10, outputTokens: 5 },
    deepSearchResult: { model: 'gpt-4o', inputTokens: 200, outputTokens: 20 },
    runningTime: 3,
    ...overrides
  };
}

/** chat 类节点响应文档 */
function makeChatDoc(overrides: Record<string, any> = {}): any {
  return {
    callId: 'resp-chat-1',
    appId: 'app1',
    appName: '客服应用',
    moduleType: 'chatNode',
    modelId: 'gpt-4o',
    modelName: 'gpt-4o',
    callTimestamp: new Date('2026-01-01T08:00:00Z'),
    chatId: 'chat1',
    inputTokens: 30,
    outputTokens: 40,
    totalTokens: 70,
    totalPoints: 2,
    callStatus: 'success',
    ...overrides
  };
}

describe('DataCapCollect 拆行采集', () => {
  let collector: DataCapCollect;

  beforeAll(() => {
    collector = new DataCapCollect();
  });

  beforeEach(() => {
    mockFind.mockReset();
    mockAggregate.mockReset();
  });

  describe('知识库搜索节点拆行', () => {
    it('全量启用时拆为 4 行:向量/重排/问题优化/深度搜索,call_id 带互异子键', async () => {
      mockBatch([makeSearchDoc()]);

      const logs = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      expect(logs).toHaveLength(4);
      expect(logs.map((l) => l.callId)).toEqual([
        'resp-1:embedding',
        'resp-1:rerank',
        'resp-1:ext_llm',
        'resp-1:deep_llm'
      ]);
    });

    it('各行的类别/场景/tokens/积分正确', async () => {
      mockBatch([makeSearchDoc()]);

      const logs = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      const [embedding, rerank, extLlm, deepLlm] = logs;

      // 向量行
      expect(embedding.modelCategory).toBe('embedding');
      expect(embedding.modelId).toBe('text-embedding-3-large');
      expect(embedding.inputTokens).toBe(100);
      expect(embedding.outputTokens).toBe(0);
      expect(embedding.totalTokens).toBe(100);
      // 重排行
      expect(rerank.modelCategory).toBe('rerank');
      expect(rerank.modelId).toBe('bge-reranker-v2');
      expect(rerank.inputTokens).toBe(50);
      // 搜索内问题优化 LLM 行:类别为 chat
      expect(extLlm.modelCategory).toBe('chat');
      expect(extLlm.modelId).toBe('gpt-4o-mini');
      expect(extLlm.inputTokens).toBe(10);
      expect(extLlm.outputTokens).toBe(5);
      // 深度搜索 LLM 行:类别为 chat
      expect(deepLlm.modelCategory).toBe('chat');
      expect(deepLlm.modelId).toBe('gpt-4o');
      expect(deepLlm.outputTokens).toBe(20);

      // 全部行:使用场景为知识库搜索、积分 0、上下文字段一致
      for (const row of logs) {
        expect(row.usageScenario).toBe('datasetSearchNode');
        expect(row.totalPoints).toBe(0);
        expect(row.appId).toBe('app1');
        expect(row.chatId).toBe('chat1');
      }
    });

    it('未启用重排/问题优化/深度搜索时只产生向量行', async () => {
      mockBatch([
        makeSearchDoc({
          rerankModel: null,
          reRankInputTokens: 0,
          queryExtensionResult: null,
          deepSearchResult: null
        })
      ]);

      const logs = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      expect(logs).toHaveLength(1);
      expect(logs[0].callId).toBe('resp-1:embedding');
      expect(logs[0].modelCategory).toBe('embedding');
      expect(logs[0].callStatus).toBe('success');
    });

    it('runningTime(节点级)仅记在向量行', async () => {
      mockBatch([makeSearchDoc()]);

      const logs = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      expect(logs[0].runningTime).toBe(3);
      expect(logs.slice(1).every((row) => row.runningTime === undefined)).toBe(true);
    });

    it('重排模型缺失但存在重排 tokens 时,重排行以 unknown 产出', async () => {
      mockBatch([makeSearchDoc({ rerankModel: null, reRankInputTokens: 50 })]);

      const logs = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      expect(logs).toHaveLength(4);
      const rerank = logs.find((l) => l.callId === 'resp-1:rerank');
      expect(rerank?.modelId).toBe('unknown');
      expect(rerank?.modelCategory).toBe('rerank');
    });
  });

  describe('拆分行状态判定', () => {
    it('无错误信息且有 token 消耗 -> success', async () => {
      mockBatch([makeSearchDoc()]);

      const logs = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      expect(logs.every((row) => row.callStatus === 'success')).toBe(true);
    });

    it('某模型无 token 消耗 -> 该行 error,其余行不受影响', async () => {
      mockBatch([makeSearchDoc({ reRankInputTokens: 0 })]);

      const logs = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      const rerank = logs.find((l) => l.callId === 'resp-1:rerank');
      const embedding = logs.find((l) => l.callId === 'resp-1:embedding');
      expect(rerank?.callStatus).toBe('error');
      expect(embedding?.callStatus).toBe('success');
    });

    it('有错误信息 -> 全部行 error', async () => {
      mockBatch([makeSearchDoc({ errorText: '向量模型调用失败' })]);

      const logs = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      expect(logs.every((row) => row.callStatus === 'error')).toBe(true);
      expect(logs.every((row) => row.errorText === '向量模型调用失败')).toBe(true);
    });

    it('节点运行超阈值且全部模型无输出 -> 全部行 timeout', async () => {
      mockBatch([
        makeSearchDoc({
          embeddingTokens: 0,
          rerankModel: null,
          reRankInputTokens: 0,
          queryExtensionResult: null,
          deepSearchResult: null,
          runningTime: 45
        })
      ]);

      const logs = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      expect(logs).toHaveLength(1);
      expect(logs[0].callStatus).toBe('timeout');
    });

    it('节点运行超阈值但有输出 -> 不判 timeout', async () => {
      mockBatch([makeSearchDoc({ runningTime: 45 })]);

      const logs = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      expect(logs.every((row) => row.callStatus === 'success')).toBe(true);
    });
  });

  describe('既有 chat 行为回归', () => {
    it('chat 节点仍为单行且 call_id 无子键', async () => {
      mockBatch([makeChatDoc()]);

      const logs = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      expect(logs).toHaveLength(1);
      expect(logs[0].callId).toBe('resp-chat-1');
      expect(logs[0].callId).not.toMatch(/:(embedding|rerank|ext_llm|deep_llm)$/);
      expect(logs[0].modelCategory).toBe('chat');
      expect(logs[0].usageScenario).toBe('chatNode');
      expect(logs[0].totalPoints).toBe(2);
    });

    it('chat 与搜索节点混合时各行互不干扰', async () => {
      mockBatch([makeChatDoc({ callId: 'resp-chat-2' }), makeSearchDoc()]);

      const logs = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      expect(logs).toHaveLength(5);
      const callIds = logs.map((l) => l.callId);
      expect(new Set(callIds).size).toBe(5);
      expect(callIds).toContain('resp-chat-2');
    });

    it('重复抽取同一范围(call_id 不变)由存储层幂等去重,提取行内容一致', async () => {
      mockBatch([makeSearchDoc()]);
      const first = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      mockBatch([makeSearchDoc()]);
      const second = await collector.extractCallLogs(
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        100
      );

      expect(second.map((l) => l.callId)).toEqual(first.map((l) => l.callId));
    });
  });
});
