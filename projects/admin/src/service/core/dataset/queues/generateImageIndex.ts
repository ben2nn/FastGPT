/**
 * 图片索引队列处理器
 * 处理 mode=image 的任务：VLM 生成图片描述索引 → 推入 mode=chunk
 * 若 collection 同时开启了 autoIndexes，也生成 summary/question 索引
 */
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '@fastgpt/service/common/system/log';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { getLLMModel, getVlmModel } from '@fastgpt/service/core/ai/model';
import { addMinutes } from 'date-fns';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { delay } from '@fastgpt/service/common/bullmq';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { checkTeamAiPointsAndLock } from './utils';
import { parseAutoIndexResponse } from './generateAutoIndex';
import { generateVector } from './generateVector';

const IMAGE_INDEX_PROMPT = `描述这张图片，用于知识库搜索索引。
重点：关键物体、文字标签、主要主题、数据图表。
要求：不超过150字，中文描述，直接输出。`;

const AUTO_INDEX_PROMPT = {
  description: `分析以下文本，生成搜索索引信息：
- SUMMARY: 一段简洁摘要（1-2句），捕捉核心含义
- Q1-Q5: 生成 3-5 个用户可能提出的问题
要求：摘要不超过100字，问题应自然可搜索，使用与源文本相同的语言。
严格按格式输出：SUMMARY: ...\nQ1: ...\nQ2: ...`,
  fixedText: `<Context>\n{{text}}\n</Context>`
};

const reduceQueue = () => {
  global.imageIndexQueueLen = global.imageIndexQueueLen > 0 ? global.imageIndexQueueLen - 1 : 0;
  return global.imageIndexQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string; agentModel: string; vlmModel: string };
  collection: { autoIndexes?: boolean; indexSize?: number };
};

export async function generateImageIndex(): Promise<any> {
  const max = global.systemEnv?.imageIndexMaxProcess || 3;
  if (global.imageIndexQueueLen >= max) return;
  global.imageIndexQueueLen++;

  try {
    while (true) {
      const startTime = Date.now();
      const {
        data,
        done = false,
        error = false
      } = await (async () => {
        try {
          const data = await MongoDatasetTraining.findOneAndUpdate(
            {
              mode: TrainingModeEnum.image,
              retryCount: { $gt: 0 },
              lockTime: { $lte: addMinutes(new Date(), -10) }
            },
            { lockTime: new Date(), $inc: { retryCount: -1 } }
          )
            .populate<PopulateType>([
              { path: 'dataset', select: 'agentModel vectorModel vlmModel' },
              { path: 'collection', select: 'autoIndexes indexSize' }
            ])
            .lean();
          if (!data) return { done: true };
          return { data };
        } catch {
          return { error: true };
        }
      })();

      if (done || !data) break;
      if (error) {
        await delay(500);
        continue;
      }
      if (!data.dataset || !data.collection) {
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }
      if (!(await checkTeamAiPointsAndLock(data.teamId))) continue;

      addLog.info(`[ImageIndex Queue] Start`);

      try {
        if (!data.q?.trim()) {
          await MongoDatasetTraining.deleteOne({ _id: data._id });
          continue;
        }

        // 1. VLM 图片描述
        const imageIndexes: { type: DatasetDataIndexTypeEnum; text: string }[] = [];
        const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
        const imageUrls: string[] = [];
        let match;
        while ((match = regex.exec(data.q)) !== null) {
          if (match[1]) imageUrls.push(match[1]);
        }

        if (imageUrls.length > 0) {
          const vlmModelData = getVlmModel(data.dataset.vlmModel);
          if (vlmModelData) {
            for (const url of imageUrls) {
              try {
                const { answerText } = await createLLMResponse({
                  body: {
                    model: vlmModelData.model,
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
                if (answerText?.trim()) {
                  imageIndexes.push({
                    type: DatasetDataIndexTypeEnum.image,
                    text: answerText.trim()
                  });
                }
              } catch (err) {
                addLog.warn(`[ImageIndex Queue] Image describe failed`, err);
              }
            }
          }
        }

        // 2. 组合模式：autoIndexes → LLM summary/question
        const allIndexes = [...imageIndexes];
        if (data.collection.autoIndexes) {
          try {
            const agentModel = getLLMModel(data.dataset.agentModel);
            const prompt = `${AUTO_INDEX_PROMPT.description}\n${replaceVariable(AUTO_INDEX_PROMPT.fixedText, { text: data.q })}`;
            const { answerText } = await createLLMResponse({
              body: {
                model: agentModel.model,
                temperature: 0.3,
                messages: [{ role: 'user', content: prompt }],
                stream: true
              }
            });
            const { summary, questions } = parseAutoIndexResponse(answerText);
            if (summary) allIndexes.push({ type: DatasetDataIndexTypeEnum.summary, text: summary });
            for (const q of questions)
              allIndexes.push({ type: DatasetDataIndexTypeEnum.question, text: q });
          } catch (err) {
            addLog.warn(`[ImageIndex Queue] Auto index failed`, err);
          }
        }

        // 3. 推入 chunk 队列
        await pushDataListToTrainingQueue({
          teamId: data.teamId,
          tmbId: data.tmbId,
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          mode: TrainingModeEnum.chunk,
          data: [{ q: data.q, a: data.a, chunkIndex: data.chunkIndex, indexes: allIndexes }],
          billId: data.billId,
          indexSize: data.collection?.indexSize,
          vectorModel: data.dataset.vectorModel,
          agentModel: data.dataset.agentModel,
          vlmModel: data.dataset.vlmModel
        });

        await MongoDatasetTraining.findByIdAndDelete(data._id);

        // 立即触发 vector 队列（standalone MongoDB 不支持 Watch）
        generateVector();

        addLog.info(`[ImageIndex Queue] Finish`, {
          time: Date.now() - startTime,
          imageCount: imageUrls.length,
          totalIndexes: allIndexes.length
        });
      } catch (err: any) {
        addLog.error(`[ImageIndex Queue] Error`, err);
        await MongoDatasetTraining.updateOne({ _id: data._id }, { errorMsg: getErrText(err) });
        await delay(100);
      }
    }
  } catch (error) {
    addLog.error(`[ImageIndex Queue] Error`, error);
  }

  if (reduceQueue()) addLog.info(`[ImageIndex Queue] Done`);
}
