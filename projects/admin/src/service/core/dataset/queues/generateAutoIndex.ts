/**
 * 自动索引队列处理器
 * 处理 mode=auto 的任务：LLM 生成 summary/question 索引 → 推入 mode=chunk
 */
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '@fastgpt/service/common/system/log';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { addMinutes } from 'date-fns';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { delay } from '@fastgpt/service/common/bullmq';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { checkTeamAiPointsAndLock } from './utils';
import { generateVector } from './generateVector';

const AUTO_INDEX_PROMPT = {
  description: `分析以下文本，生成搜索索引信息：
- SUMMARY: 一段简洁摘要（1-2句），捕捉核心含义
- Q1-Q5: 生成 3-5 个用户可能提出的问题

要求：摘要不超过100字，问题应自然可搜索，使用与源文本相同的语言。
严格按格式输出：SUMMARY: ...\nQ1: ...\nQ2: ...`,
  fixedText: `<Context>\n{{text}}\n</Context>`
};

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

const reduceQueue = () => {
  global.autoIndexQueueLen = global.autoIndexQueueLen > 0 ? global.autoIndexQueueLen - 1 : 0;
  return global.autoIndexQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string; agentModel: string; vlmModel: string };
  collection: { indexSize?: number };
};

export async function generateAutoIndex(): Promise<any> {
  const max = global.systemEnv?.autoIndexMaxProcess || 5;
  if (global.autoIndexQueueLen >= max) return;
  global.autoIndexQueueLen++;

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
              mode: TrainingModeEnum.auto,
              retryCount: { $gt: 0 },
              lockTime: { $lte: addMinutes(new Date(), -10) }
            },
            { lockTime: new Date(), $inc: { retryCount: -1 } }
          )
            .populate<PopulateType>([
              { path: 'dataset', select: 'agentModel vectorModel vlmModel' },
              { path: 'collection', select: 'indexSize' }
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

      addLog.info(`[AutoIndex Queue] Start`);

      try {
        if (!data.q?.trim()) {
          await MongoDatasetTraining.deleteOne({ _id: data._id });
          continue;
        }

        const modelData = getLLMModel(data.dataset.agentModel);
        const prompt = `${AUTO_INDEX_PROMPT.description}\n${replaceVariable(AUTO_INDEX_PROMPT.fixedText, { text: data.q })}`;
        const { answerText, usage } = await createLLMResponse({
          body: {
            model: modelData.model,
            temperature: 0.3,
            messages: [{ role: 'user', content: prompt }],
            stream: true
          }
        });

        const { summary, questions } = parseAutoIndexResponse(answerText);
        const indexes: { type: DatasetDataIndexTypeEnum; text: string }[] = [];
        if (summary) indexes.push({ type: DatasetDataIndexTypeEnum.summary, text: summary });
        for (const q of questions)
          indexes.push({ type: DatasetDataIndexTypeEnum.question, text: q });

        await pushDataListToTrainingQueue({
          teamId: data.teamId,
          tmbId: data.tmbId,
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          mode: TrainingModeEnum.chunk,
          data: [{ q: data.q, a: data.a, chunkIndex: data.chunkIndex, indexes }],
          billId: data.billId,
          indexSize: data.collection?.indexSize,
          vectorModel: data.dataset.vectorModel,
          agentModel: data.dataset.agentModel,
          vlmModel: data.dataset.vlmModel
        });

        await MongoDatasetTraining.findByIdAndDelete(data._id);

        // 立即触发 vector 队列（standalone MongoDB 不支持 Watch）
        generateVector();

        addLog.info(`[AutoIndex Queue] Finish`, {
          time: Date.now() - startTime,
          summary: summary.length > 0,
          questionCount: questions.length
        });
      } catch (err: any) {
        addLog.error(`[AutoIndex Queue] Error`, err);
        await MongoDatasetTraining.updateOne({ _id: data._id }, { errorMsg: getErrText(err) });
        await delay(100);
      }
    }
  } catch (error) {
    addLog.error(`[AutoIndex Queue] Error`, error);
  }

  if (reduceQueue()) addLog.info(`[AutoIndex Queue] Done`);
}
