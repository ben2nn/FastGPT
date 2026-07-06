/**
 * Admin 专用的 Collection 创建控制器
 * 与共享包 createCollectionAndInsertData 功能相同，但路由逻辑不检查 isPlus
 *
 * 支持两种使用方式：
 * 1. enhanceInline=true：在请求内就地完成索引增强（立即执行模式）
 * 2. enhanceInline=false：推入训练队列，由 parse 队列处理（队列模式）
 */
import type {
  DatasetSchemaType,
  DatasetCollectionSchemaType
} from '@fastgpt/global/core/dataset/type';
import type { CreateOneCollectionParams } from '@fastgpt/service/core/dataset/collection/controller';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { rawText2Chunks, readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import {
  pushDataListToTrainingQueue,
  pushDatasetToParseQueue
} from '@fastgpt/service/core/dataset/training/controller';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { computedCollectionChunkSettings } from '@fastgpt/global/core/dataset/training/utils';
import { getLLMModel, getVlmModel, getEmbeddingModel } from '@fastgpt/service/core/ai/model';
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
import { setProgress } from '@/service/core/dataset/enhanceProgress';
import type { ClientSession } from '@fastgpt/service/common/mongo';

// ==================== 索引增强 ====================

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
  for (const match of answer.matchAll(/Q\d+:\s*([\s\S]*?)(?=\nQ\d|\nSUMMARY|$)/g)) {
    const q = match[1]?.trim();
    if (q) questions.push(q);
  }
  return { summary, questions };
}

async function enhanceAutoIndexes(text: string, model: string) {
  if (!text?.trim())
    return { indexes: [] as { type: DatasetDataIndexTypeEnum; text: string }[], tokens: 0 };
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

async function enhanceImageIndexes(text: string, vlmModelName: string) {
  if (!text?.trim())
    return { indexes: [] as { type: DatasetDataIndexTypeEnum; text: string }[], tokens: 0 };
  const imageUrls: string[] = [];
  let match;
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) imageUrls.push(match[1]);
  }
  if (imageUrls.length === 0)
    return { indexes: [] as { type: DatasetDataIndexTypeEnum; text: string }[], tokens: 0 };
  const vlmModel = getVlmModel(vlmModelName);
  if (!vlmModel)
    return { indexes: [] as { type: DatasetDataIndexTypeEnum; text: string }[], tokens: 0 };

  const indexes: { type: DatasetDataIndexTypeEnum; text: string }[] = [];
  let totalTokens = 0;
  for (const url of imageUrls) {
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
                { type: 'image_url', image_url: { url } }
              ]
            }
          ],
          stream: true
        }
      });
      totalTokens += usage.inputTokens + usage.outputTokens;
      if (answerText?.trim())
        indexes.push({ type: DatasetDataIndexTypeEnum.image, text: answerText.trim() });
    } catch (err) {
      addLog.warn(`[Admin] Image enhance failed`, err);
    }
  }
  return { indexes, tokens: totalTokens };
}

// ==================== 训练模式路由（不检查 isPlus）====================

function getAdminTrainingMode(collection: {
  trainingType: DatasetCollectionDataProcessModeEnum;
  autoIndexes?: boolean;
  imageIndex?: boolean;
}): TrainingModeEnum {
  if (collection.trainingType === DatasetCollectionDataProcessModeEnum.imageParse) {
    return TrainingModeEnum.imageParse;
  }
  if (collection.trainingType === DatasetCollectionDataProcessModeEnum.qa) {
    return TrainingModeEnum.qa;
  }
  if (
    collection.trainingType === DatasetCollectionDataProcessModeEnum.chunk &&
    collection.imageIndex
  ) {
    return TrainingModeEnum.image;
  }
  if (
    collection.trainingType === DatasetCollectionDataProcessModeEnum.chunk &&
    collection.autoIndexes
  ) {
    return TrainingModeEnum.auto;
  }
  return TrainingModeEnum.chunk;
}

// ==================== 主控制器 ====================

export type AdminCreateCollectionParams = {
  dataset: DatasetSchemaType;
  createCollectionParams: CreateOneCollectionParams;
  rawText?: string;
  billId?: string;
  session?: ClientSession;
  // 索引增强选项
  enhanceInline?: boolean; // true=就地增强（立即执行），false=推入训练队列
  taskId?: string; // SSE 进度追踪 ID
};

export async function adminCreateCollectionAndInsertData({
  dataset,
  createCollectionParams,
  rawText,
  billId,
  session,
  enhanceInline = false,
  taskId
}: AdminCreateCollectionParams) {
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
  const trainingMode = getAdminTrainingMode({
    trainingType,
    autoIndexes: formatParams.autoIndexes,
    imageIndex: formatParams.imageIndex
  });

  const needEnhance =
    trainingMode === TrainingModeEnum.auto || trainingMode === TrainingModeEnum.image;

  // ---- 有 rawText：直接分块 ----
  if (rawText) {
    progress({ current: 0, total: 0, phase: 'chunking', message: '文本分块中...' });

    const maxSize = getLLMMaxChunkSize(getLLMModel(dataset.agentModel));
    const { chunks } = await rawText2Chunks({
      rawText,
      chunkTriggerType: formatParams.chunkTriggerType,
      chunkTriggerMinSize: formatParams.chunkTriggerMinSize,
      chunkSize: formatParams.chunkSize,
      paragraphChunkDeep: formatParams.paragraphChunkDeep,
      paragraphChunkMinSize: formatParams.paragraphChunkMinSize,
      maxSize,
      overlapRatio: trainingType === DatasetCollectionDataProcessModeEnum.chunk ? 0.2 : 0,
      customReg: formatParams.chunkSplitter ? [formatParams.chunkSplitter] : []
    });

    // 就地增强（如果需要）
    const enhancedIndexes = new Map<number, { type: DatasetDataIndexTypeEnum; text: string }[]>();
    if (enhanceInline && needEnhance) {
      progress({
        current: 0,
        total: chunks.length,
        phase: 'enhancing',
        message: `索引增强中 (0/${chunks.length})...`
      });
      const agentModel = getLLMModel(dataset.agentModel);
      for (let i = 0; i < chunks.length; i++) {
        const extras: { type: DatasetDataIndexTypeEnum; text: string }[] = [];
        if (formatParams.autoIndexes) {
          try {
            const { indexes } = await enhanceAutoIndexes(chunks[i].q || '', agentModel.model);
            extras.push(...indexes);
          } catch (err) {
            addLog.warn('[Admin] Auto enhance failed', err);
          }
        }
        if (formatParams.imageIndex) {
          try {
            const { indexes } = await enhanceImageIndexes(chunks[i].q || '', dataset.vlmModel);
            extras.push(...indexes);
          } catch (err) {
            addLog.warn('[Admin] Image enhance failed', err);
          }
        }
        if (extras.length > 0) enhancedIndexes.set(i, extras);
        progress({
          current: i + 1,
          total: chunks.length,
          phase: 'enhancing',
          message: `索引增强中 (${i + 1}/${chunks.length})...`
        });
      }
      addLog.info(`[Admin] Enhancement done`, {
        chunkCount: chunks.length,
        enhancedCount: enhancedIndexes.size
      });
    }

    await checkDatasetIndexLimit({
      teamId,
      insertLen: predictDataLimitLength(
        enhanceInline ? TrainingModeEnum.chunk : trainingMode,
        chunks
      )
    });

    progress({
      current: chunks.length,
      total: chunks.length,
      phase: 'pushing',
      message: '保存数据...'
    });

    const fn = async (sess: ClientSession) => {
      const { _id: collectionId } = await createOneCollection({
        ...formatParams,
        trainingType,
        chunkSize: formatParams.chunkSize,
        indexSize: formatParams.indexSize,
        hashRawText: hashStr(rawText),
        rawTextLength: rawText.length,
        session: sess
      });

      const data = chunks.map((item, index) => ({
        q: item.q,
        a: item.a,
        indexes: [
          ...(item.indexes?.map((text) => ({
            type: DatasetDataIndexTypeEnum.custom as `${DatasetDataIndexTypeEnum}`,
            text
          })) || []),
          ...(enhancedIndexes.get(index) || [])
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
        // 就地增强后统一推入 chunk；否则推入正确的训练模式
        mode: enhanceInline ? TrainingModeEnum.chunk : trainingMode,
        billId,
        data,
        session: sess
      });

      return { collectionId: String(collectionId), insertResults };
    };

    const result = session ? await fn(session) : await mongoSessionRun(fn);
    progress({ current: chunks.length, total: chunks.length, phase: 'done', message: '完成' });
    return result;
  }

  // ---- 无 rawText（文件/链接）：创建 adminParse 任务（不与 app 的 parse 队列竞争）----
  progress({ current: 0, total: 0, phase: 'reading', message: '准备处理...' });

  const fn = async (sess: ClientSession) => {
    const { _id: collectionId } = await createOneCollection({
      ...formatParams,
      trainingType,
      chunkSize: formatParams.chunkSize,
      indexSize: formatParams.indexSize,
      session: sess
    });

    // 使用 'enhance' 模式，app 不监听此模式，admin 独占
    const { MongoDatasetTraining } = await import('@fastgpt/service/core/dataset/training/schema');
    await MongoDatasetTraining.create(
      [
        {
          teamId,
          tmbId,
          datasetId: String(dataset._id),
          collectionId: String(collectionId),
          billId,
          mode: TrainingModeEnum.enhance
        }
      ],
      { session: sess, ordered: true }
    );

    return { collectionId: String(collectionId), insertResults: { insertLen: 0 } };
  };

  return session ? await fn(session) : await mongoSessionRun(fn);
}
