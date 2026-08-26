/**
 * 索引增强队列处理器
 * 处理 mode=enhance 且有 dataId 的任务：对已有数据进行 LLM 索引增强
 * 使用 Q-A-Index 三字段结构更新已有数据
 *
 * 注意：无 dataId 的 mode=enhance 任务（文件/URL 解析）由 watch 路由到 datasetParseQueue
 */
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/service/common/bullmq';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { checkTeamAiPointsAndLock } from './utils';
import { stripHtml, unwrapAutoLinkUrl } from '@/service/common/string';
import { findTrainingTaskWithAdminFallback } from '@/service/core/dataset/training/queuePick';

// Q-A-Index Prompt（参考 convert_kb_csv.py 逻辑）
const ENHANCE_QA_INDEX_PROMPT = `你是一名知识库索引生成专家。根据以下切片内容，生成检索信息。

## 输出要求

1. **q**：
   - 第一部分：1-2 句话概括切片主题和核心含义（不要包含具体地址、电话、数字等细节）
   - 第二部分：追加 2-3 个用户可能会搜索的口语化问题
   - 不要编造编号、条号等原文不存在的信息
   - 总长度控制在 100-150 字以内

2. **indexes**：
   - 6-10 个口语化检索词/同义词
   - 用英文分号 ; 分隔
   - 包含：主题关键词、同义词、用户可能的搜索用语

## 切片内容
标题：{{title}}
{{content}}

## 输出格式（纯 JSON，不要 markdown 标记）
{"q": "主题概括。自然提问1？自然提问2？", "indexes": "检索词1;检索词2;检索词3"}

## 示例
{"q": "放射诊疗建设项目需要进行职业病危害放射防护预评价审核。如何办理放射防护预评价审核？需要准备哪些材料？", "indexes": "放射防护;预评价;职业病危害;放射诊疗;卫生审批"}`;

function parseEnhanceResult(text: string): { q: string; indexes: string[] } {
  try {
    let cleanText = text.trim();
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const match = cleanText.match(/\{[\s\S]*\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      const q = String(obj.q || '').trim();
      const indexesStr = String(obj.indexes || '').trim();
      const indexes = indexesStr
        .split(/[,，;；|]/)
        .map((s: string) => s.trim())
        .filter(Boolean);
      return { q, indexes };
    }
  } catch {
    // fallback
  }
  return { q: '', indexes: [] };
}

// A 字段上下文头拼接
function buildAnswerWithContext(
  originalA: string,
  title: string,
  chapter: string,
  article: string
): string {
  const header = [title, chapter, article].filter(Boolean).join(' | ');
  if (header) {
    return `【${header}】\n${originalA}`;
  }
  return originalA;
}

function extractTitle(q: string): string {
  const firstLine = unwrapAutoLinkUrl(q.split('\n')[0]?.trim() || '');
  return firstLine
    .replace(/^#{1,6}\s*/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
}

function extractChapter(q: string): string {
  const match = q.match(/第[一二三四五六七八九十百千\d]+章[^\n]*/);
  return match ? match[0].trim() : '';
}

function extractArticle(q: string): string {
  const match = q.match(/第[一二三四五六七八九十百千\d]+条/);
  return match ? match[0] : '';
}

const reduceQueue = () => {
  global.enhanceIndexQueueLen =
    global.enhanceIndexQueueLen > 0 ? global.enhanceIndexQueueLen - 1 : 0;
  return global.enhanceIndexQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string; agentModel: string; vlmModel: string };
  collection: { indexSize?: number; name?: string };
};

export async function generateEnhanceIndex(): Promise<any> {
  const max = global.systemEnv?.autoIndexMaxProcess || 5;
  if (global.enhanceIndexQueueLen >= max) return;
  global.enhanceIndexQueueLen++;

  try {
    while (true) {
      const startTime = Date.now();
      const {
        data,
        done = false,
        error = false
      } = await (async () => {
        try {
          const data = await findTrainingTaskWithAdminFallback({
            mode: TrainingModeEnum.enhance,
            // 仅处理有 dataId 的增强任务(无 dataId 的由 parse 队列处理)
            extraFilter: { dataId: { $exists: true, $ne: null } },
            coolMinutes: 10,
            populate: (query) =>
              query
                .populate<PopulateType>([
                  { path: 'dataset', select: 'agentModel vectorModel vlmModel' },
                  { path: 'collection', select: 'indexSize name' }
                ])
                .lean()
          });
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

      addLog.info(`[EnhanceIndex Queue] Start`);

      try {
        if (!data.q?.trim()) {
          await MongoDatasetTraining.deleteOne({ _id: data._id });
          continue;
        }

        // 读取已有数据
        const { MongoDatasetData } = await import('@fastgpt/service/core/dataset/data/schema');
        const existingData = await MongoDatasetData.findById(data.dataId).lean();
        if (!existingData) {
          await MongoDatasetTraining.deleteOne({ _id: data._id });
          continue;
        }

        // 构建 Prompt（使用 Q-A-Index 结构）
        // 从 q 内容中提取标题，不用集合名（避免文件编号干扰）
        // 去掉 HTML 标签，避免将标签作为"内容"发送给 LLM
        const title = extractTitle(existingData.q);
        const cleanA = stripHtml(existingData.a || '');
        const cleanQ = stripHtml(existingData.q || '');
        const content = cleanA || cleanQ;
        const prompt = ENHANCE_QA_INDEX_PROMPT.replace('{{title}}', title).replace(
          '{{content}}',
          content
        );

        // 调用 LLM
        const modelData = getLLMModel(data.dataset.agentModel);
        const { answerText } = await createLLMResponse({
          body: {
            model: modelData.model,
            temperature: 0.3,
            messages: [{ role: 'user', content: prompt }],
            stream: true
          }
        });

        // 解析结果
        const { q: newQ, indexes: newIndexes } = parseEnhanceResult(answerText);

        // 构建新的 A 字段（去掉 HTML + 加上下文头）
        const chapter = extractChapter(existingData.q);
        const article = extractArticle(existingData.q);
        const newA = buildAnswerWithContext(cleanA || cleanQ, title, chapter, article);

        // 构建新的 indexes 数组
        const indexes: { type: DatasetDataIndexTypeEnum; text: string }[] = [];

        // 1. 添加默认索引（从新 Q/A 内容分块生成）
        const { splitText2Chunks } = await import('@fastgpt/global/common/string/textSplitter');
        const indexSize = data.collection?.indexSize || 512;
        const finalQ = newQ || existingData.q;
        const finalA = newA;

        const qChunks = splitText2Chunks({ text: finalQ, chunkSize: indexSize }).chunks;
        const aChunks = splitText2Chunks({ text: finalA, chunkSize: indexSize }).chunks;

        for (const chunk of qChunks) {
          indexes.push({ type: DatasetDataIndexTypeEnum.default, text: chunk });
        }
        for (const chunk of aChunks) {
          indexes.push({ type: DatasetDataIndexTypeEnum.default, text: chunk });
        }

        // 2. 添加 AI 生成的标签索引（合并为一条，分号分隔）
        if (newIndexes.length > 0) {
          indexes.push({
            type: DatasetDataIndexTypeEnum.custom,
            text: newIndexes.join(';')
          });
        }

        // 3. 读取已有向量 ID（用于后续删除）
        const deleteVectorIdList = existingData.indexes
          .map((idx: any) => idx.dataId)
          .filter(Boolean);

        // 3. 插入新向量
        const { insertDatasetDataVector, deleteDatasetDataVector } = await import(
          '@fastgpt/service/common/vectorDB/controller'
        );
        const { getEmbeddingModel } = await import('@fastgpt/service/core/ai/model');

        const vectorModel = getEmbeddingModel(data.dataset.vectorModel);
        addLog.info(
          `[EnhanceIndex] Inserting ${indexes.length} vectors with model ${vectorModel?.model}`
        );
        const insertResult = await insertDatasetDataVector({
          inputs: indexes.map((idx) => idx.text),
          model: vectorModel,
          teamId: data.teamId,
          datasetId: data.datasetId,
          collectionId: data.collectionId
        });
        addLog.info(`[EnhanceIndex] Vectors inserted: ${insertResult.insertIds.length}`);

        // 3. 给每个 index 分配向量 ID
        indexes.forEach((item, idx) => {
          (item as any).dataId = insertResult.insertIds[idx];
        });

        // 5. 直接更新 MongoDatasetData（q + a + indexes，一步到位）
        addLog.info(
          `[EnhanceIndex] Updating data ${data.dataId}: q=${!!newQ}, indexes=${indexes.length}`
        );
        await MongoDatasetData.updateOne(
          { _id: data.dataId },
          {
            $set: {
              q: newQ || existingData.q,
              a: newA,
              indexes
            }
          }
        );

        // 6. 删除旧向量
        addLog.info(`[EnhanceIndex] Deleting ${deleteVectorIdList.length} old vectors`);
        await deleteDatasetDataVector({
          teamId: data.teamId,
          idList: deleteVectorIdList
        });

        // 6. 删除 enhance 训练记录
        await MongoDatasetTraining.findByIdAndDelete(data._id);

        addLog.info(`[EnhanceIndex Queue] Finish`, {
          time: Date.now() - startTime,
          dataId: String(data.dataId),
          qUpdated: !!newQ,
          indexCount: indexes.length,
          oldVectorsDeleted: deleteVectorIdList.length,
          newVectorsInserted: insertResult.insertIds.length
        });
      } catch (err: any) {
        addLog.error(`[EnhanceIndex Queue] Error`, err);
        await MongoDatasetTraining.updateOne({ _id: data._id }, { errorMsg: getErrText(err) });
        await delay(100);
      }
    }
  } catch (error) {
    addLog.error(`[EnhanceIndex Queue] Error`, error);
  }

  if (reduceQueue()) addLog.info(`[EnhanceIndex Queue] Done`);
}
