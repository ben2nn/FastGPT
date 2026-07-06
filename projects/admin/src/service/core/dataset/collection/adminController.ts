/**
 * Admin 专用的文件 Collection 创建控制器
 * 绕过 parse 队列，在请求内就地完成：读取原始文本 → 分块 → 索引增强 → 推入 chunk 队列
 * 避免与 app 的 parse 队列竞争
 */
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import type { CreateOneCollectionParams } from '@fastgpt/service/core/dataset/collection/controller';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { rawText2Chunks, readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { computedCollectionChunkSettings } from '@fastgpt/global/core/dataset/training/utils';
import { getLLMModel, getVlmModel } from '@fastgpt/service/core/ai/model';
import { getLLMMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import {
  TrainingModeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { setProgress } from '@/service/core/dataset/enhanceProgress';

// ==================== 索引增强 Prompt ====================

const AUTO_INDEX_PROMPT = {
  description: `分析以下文本，生成搜索索引信息：
- SUMMARY: 一段简洁摘要（1-2句），捕捉核心含义
- Q1-Q5: 生成 3-5 个用户可能提出的问题

要求：摘要不超过100字，问题应自然可搜索，使用与源文本相同的语言。
严格按格式输出：SUMMARY: ...\nQ1: ...\nQ2: ...`,
  fixedText: `<Context>\n{{text}}\n</Context>`
};

const IMAGE_INDEX_PROMPT = `描述这张图片，用于知识库搜索索引。
重点：关键物体、文字标签、主要主题、数据图表。
要求：不超过150字，中文描述，直接输出。`;

function parseAutoIndexResponse(answer: string): { summary: string; questions: string[] } {
  answer = answer.replace(/\\n/g, '\n');
  let summary = '';
  const questions: string[] = [];
  const summaryMatch = answer.match(/SUMMARY:\s*([\s\S]*?)(?=\nQ\d|$)/);
  if (summaryMatch?.[1]) summary = summaryMatch[1].trim();
  const questionRegex = /Q\d+:\s*([\s\S]*?)(?=\nQ\d|\nSUMMARY|$)/g;
  for (const match of answer.matchAll(questionRegex)) {
    const q = match[1]?.trim();
    if (q) questions.push(q);
  }
  return { summary, questions };
}

// ==================== 索引增强函数 ====================

async function enhanceChunkAutoIndexes(
  text: string,
  model: string
): Promise<{ indexes: { type: DatasetDataIndexTypeEnum; text: string }[]; tokens: number }> {
  if (!text?.trim()) return { indexes: [], tokens: 0 };
  const prompt = `${AUTO_INDEX_PROMPT.description}\n${replaceVariable(AUTO_INDEX_PROMPT.fixedText, { text })}`;
  const { answerText, usage } = await createLLMResponse({
    body: { model, temperature: 0.3, messages: [{ role: 'user', content: prompt }], stream: true }
  });
  const { summary, questions } = parseAutoIndexResponse(answerText);
  const indexes: { type: DatasetDataIndexTypeEnum; text: string }[] = [];
  if (summary) indexes.push({ type: DatasetDataIndexTypeEnum.summary, text: summary });
  for (const q of questions) indexes.push({ type: DatasetDataIndexTypeEnum.question, text: q });
  return { indexes, tokens: usage.inputTokens + usage.outputTokens };
}

async function enhanceChunkImageIndexes(
  text: string,
  vlmModelName: string
): Promise<{ indexes: { type: DatasetDataIndexTypeEnum; text: string }[]; tokens: number }> {
  if (!text?.trim()) return { indexes: [], tokens: 0 };
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  const imageUrls: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) imageUrls.push(match[1]);
  }
  if (imageUrls.length === 0) return { indexes: [], tokens: 0 };
  const vlmModel = getVlmModel(vlmModelName);
  if (!vlmModel) return { indexes: [], tokens: 0 };

  const indexes: { type: DatasetDataIndexTypeEnum; text: string }[] = [];
  let totalTokens = 0;
  for (const imageUrl of imageUrls) {
    try {
      const { answerText, usage } = await createLLMResponse({
        body: {
          model: vlmModel.model,
          temperature: 0.1,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: IMAGE_INDEX_PROMPT },
                { type: 'image_url', image_url: { url: imageUrl } }
              ]
            }
          ],
          stream: true
        }
      });
      totalTokens += usage.inputTokens + usage.outputTokens;
      if (answerText?.trim()) {
        indexes.push({ type: DatasetDataIndexTypeEnum.image, text: answerText.trim() });
      }
    } catch (err) {
      addLog.warn(`[Admin Controller] Failed to describe image`, err);
    }
  }
  return { indexes, tokens: totalTokens };
}

// ==================== 主控制器 ====================

export type AdminCreateFileCollectionParams = {
  dataset: DatasetSchemaType;
  createCollectionParams: CreateOneCollectionParams;
  readSourceType: Parameters<typeof readDatasetSourceRawText>[0];
  customPdfParse?: boolean;
  taskId?: string; // 用于 SSE 进度推送
};

/**
 * Admin 专用：直接处理文件 Collection 创建（绕过 parse 队列）
 *
 * 流程：
 * 1. 读取原始文本（S3 文件/链接/API）
 * 2. LLM 段落优化（可选）
 * 3. 文本分块
 * 4. 就地索引增强（autoIndexes → LLM summary/question, imageIndex → VLM 描述）
 * 5. 创建 Collection + 推入 mode=chunk 队列
 */
export async function adminCreateFileCollection({
  dataset,
  createCollectionParams,
  readSourceType,
  customPdfParse,
  taskId
}: AdminCreateFileCollectionParams) {
  const progress = (data: { current: number; total: number; phase: string; message?: string }) => {
    if (taskId) setProgress(taskId, data as any);
  };
  const formatParams = computedCollectionChunkSettings({
    ...createCollectionParams,
    llmModel: getLLMModel(dataset.agentModel),
    vectorModel: getEmbeddingModel(dataset.vectorModel)
  });

  const teamId = formatParams.teamId;
  const tmbId = formatParams.tmbId;
  const trainingType = formatParams.trainingType || DatasetCollectionDataProcessModeEnum.chunk;

  // 1. 读取原始文本
  progress({ current: 0, total: 0, phase: 'reading', message: '读取文件内容...' });
  const { title, rawText } = await readDatasetSourceRawText({
    teamId,
    tmbId,
    customPdfParse,
    usageId: undefined,
    datasetId: String(dataset._id),
    ...readSourceType
  });

  // 2. 分块
  progress({ current: 0, total: 0, phase: 'chunking', message: '文本分块中...' });
  const chunks = await rawText2Chunks({
    rawText,
    chunkTriggerType: formatParams.chunkTriggerType,
    chunkTriggerMinSize: formatParams.chunkTriggerMinSize,
    chunkSize: formatParams.chunkSize,
    paragraphChunkDeep: formatParams.paragraphChunkDeep,
    paragraphChunkMinSize: formatParams.paragraphChunkMinSize,
    maxSize: getLLMMaxChunkSize(getLLMModel(dataset.agentModel)),
    overlapRatio: trainingType === DatasetCollectionDataProcessModeEnum.chunk ? 0.2 : 0,
    customReg: formatParams.chunkSplitter ? [formatParams.chunkSplitter] : []
  });

  // 3. 就地索引增强
  const chunkEnhancedIndexes: Map<number, { type: DatasetDataIndexTypeEnum; text: string }[]> =
    new Map();

  if (formatParams.autoIndexes || formatParams.imageIndex) {
    progress({
      current: 0,
      total: chunks.length,
      phase: 'enhancing',
      message: `索引增强中 (0/${chunks.length})...`
    });

    addLog.info(`[Admin Controller] Inline index enhancement start`, {
      autoIndexes: formatParams.autoIndexes,
      imageIndex: formatParams.imageIndex,
      chunkCount: chunks.length
    });

    const agentModel = getLLMModel(dataset.agentModel);
    let totalTokens = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i].q || '';
      const extraIndexes: { type: DatasetDataIndexTypeEnum; text: string }[] = [];

      if (formatParams.autoIndexes) {
        try {
          const { indexes, tokens } = await enhanceChunkAutoIndexes(chunkText, agentModel.model);
          extraIndexes.push(...indexes);
          totalTokens += tokens;
        } catch (err) {
          addLog.warn(`[Admin Controller] Auto index failed`, err);
        }
      }

      if (formatParams.imageIndex) {
        try {
          const { indexes, tokens } = await enhanceChunkImageIndexes(chunkText, dataset.vlmModel);
          extraIndexes.push(...indexes);
          totalTokens += tokens;
        } catch (err) {
          addLog.warn(`[Admin Controller] Image index failed`, err);
        }
      }

      if (extraIndexes.length > 0) {
        chunkEnhancedIndexes.set(i, extraIndexes);
      }

      progress({
        current: i + 1,
        total: chunks.length,
        phase: 'enhancing',
        message: `索引增强中 (${i + 1}/${chunks.length})...`
      });
    }

    // 跳过计费（admin 未部署商业版计费服务）

    addLog.info(`[Admin Controller] Enhancement done`, {
      chunkCount: chunks.length,
      enhancedCount: chunkEnhancedIndexes.size
    });
  }

  // 4. 限制检查
  await checkDatasetIndexLimit({
    teamId,
    insertLen: predictDataLimitLength(TrainingModeEnum.chunk, chunks)
  });

  // 5. 创建 Collection + 推入 chunk 队列（事务内）
  progress({
    current: chunks.length,
    total: chunks.length,
    phase: 'pushing',
    message: '保存数据...'
  });
  const fn = async (session: any) => {
    const { _id: collectionId } = await createOneCollection({
      ...formatParams,
      trainingType,
      chunkSize: formatParams.chunkSize,
      indexSize: formatParams.indexSize,
      hashRawText: hashStr(rawText),
      rawTextLength: rawText.length,
      session
    });

    // 跳过计费记录（admin 未部署商业版计费服务）
    const usageId = '';

    const trainingData = chunks.map((item, index) => ({
      ...item,
      indexes: [
        ...(item.indexes?.map((text) => ({
          type: DatasetDataIndexTypeEnum.custom as `${DatasetDataIndexTypeEnum}`,
          text
        })) || []),
        ...(chunkEnhancedIndexes.get(index) || [])
      ],
      chunkIndex: index
    }));

    const insertResults = await pushDataListToTrainingQueue({
      teamId,
      tmbId,
      datasetId: String(dataset._id),
      collectionId: String(collectionId),
      agentModel: dataset.agentModel,
      vectorModel: dataset.vectorModel,
      vlmModel: dataset.vlmModel,
      indexSize: formatParams.indexSize,
      mode: TrainingModeEnum.chunk,
      billId: usageId,
      data: trainingData,
      session
    });

    return { collectionId: String(collectionId), insertResults };
  };

  const result = await mongoSessionRun(fn);
  progress({
    current: chunks.length,
    total: chunks.length,
    phase: 'done',
    message: `完成！${chunks.length} 个分块已处理`
  });
  return result;
}
