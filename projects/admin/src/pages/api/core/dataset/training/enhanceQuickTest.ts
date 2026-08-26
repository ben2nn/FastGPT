import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { addLog } from '@fastgpt/service/common/system/log';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type {
  EnhanceQuickTestBody,
  EnhanceQuickTestResponse
} from '@/pageComponents/dataset/detail/IndexEnhance/types';
import { unwrapAutoLinkUrl } from '@/service/common/string';

async function handler(
  req: ApiRequestProps<EnhanceQuickTestBody>,
  _res: NextApiResponse
): Promise<EnhanceQuickTestResponse> {
  const { datasetId, collectionIds, config } = req.body;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });

  // 1. 读取前 5 条数据
  const query: Record<string, any> = { teamId, datasetId };
  if (collectionIds?.length) {
    query.collectionId = { $in: collectionIds };
  }

  const dataList = await MongoDatasetData.find(query).sort({ chunkIndex: 1 }).limit(5).lean();

  if (dataList.length === 0) {
    return Promise.reject('选中范围内没有数据');
  }

  // 2. 批量查询集合名称
  const collectionIdsSet = new Set(dataList.map((d) => String(d.collectionId)));
  const collections = await MongoDatasetCollection.find(
    { _id: { $in: Array.from(collectionIdsSet) } },
    { name: 1 }
  ).lean();
  const collectionMap = new Map(collections.map((c) => [String(c._id), c.name]));

  // 4. 逐条调用 AI 生成 Q + Indexes，直接更新数据（不走队列）
  const items: EnhanceQuickTestResponse['items'] = [];
  let success = 0;
  let skipped = 0;

  for (const data of dataList) {
    // 跳过超长切片
    if (data.q.length > (config.aiIndexConfig.chunkLimit || 8000)) {
      skipped++;
      continue;
    }

    try {
      // 构建 Prompt
      const title = extractTitle(data.q);
      const prompt = buildEnhancePrompt(config, data, title);

      // 调用 AI
      const llmResult = await createLLMResponse({
        body: {
          model: dataset.agentModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3
        }
      });

      const parsed = parseEnhanceResult(llmResult.answerText);
      if (!parsed.q) {
        skipped++;
        continue;
      }

      // A 字段用规则拼接上下文头
      const chapter = extractChapter(data.q);
      const article = extractArticle(data.q);
      const newA = buildAnswerWithContextFull(data.a || data.q, title, chapter, article);

      // 构建 indexes（默认索引 + 自定义标签）
      const { splitText2Chunks } = await import('@fastgpt/global/common/string/textSplitter');
      const { insertDatasetDataVector, deleteDatasetDataVector } = await import(
        '@fastgpt/service/common/vectorDB/controller'
      );
      const { getEmbeddingModel } = await import('@fastgpt/service/core/ai/model');

      const indexSize = 512;
      const finalQ = parsed.q;
      const indexes: { type: string; text: string; dataId?: string }[] = [];

      // 默认索引
      const qChunks = splitText2Chunks({ text: finalQ, chunkSize: indexSize }).chunks;
      const aChunks = splitText2Chunks({ text: newA, chunkSize: indexSize }).chunks;
      for (const chunk of qChunks) indexes.push({ type: 'default', text: chunk });
      for (const chunk of aChunks) indexes.push({ type: 'default', text: chunk });

      // 自定义标签索引
      if (parsed.indexes.length > 0) {
        indexes.push({ type: 'custom', text: parsed.indexes.join(';') });
      }

      // 读取旧向量 ID
      const deleteVectorIdList = (data.indexes || []).map((idx: any) => idx.dataId).filter(Boolean);

      // 插入新向量
      const vectorModel = getEmbeddingModel(dataset.vectorModel);
      addLog.info(
        `[QuickTest] Inserting ${indexes.length} vectors with model ${vectorModel?.model}`
      );
      const insertResult = await insertDatasetDataVector({
        inputs: indexes.map((idx) => idx.text),
        model: vectorModel,
        teamId,
        datasetId,
        collectionId: data.collectionId
      });
      addLog.info(`[QuickTest] Vectors inserted: ${insertResult.insertIds.length}`);

      // 分配向量 ID
      indexes.forEach((item, idx) => {
        item.dataId = insertResult.insertIds[idx];
      });

      // 直接更新 MongoDatasetData
      addLog.info(`[QuickTest] Updating data ${data._id}: q=true, indexes=${indexes.length}`);
      await MongoDatasetData.updateOne(
        { _id: data._id },
        { $set: { q: finalQ, a: newA, indexes } }
      );

      // 删除旧向量
      if (deleteVectorIdList.length > 0) {
        addLog.info(`[QuickTest] Deleting ${deleteVectorIdList.length} old vectors`);
        await deleteDatasetDataVector({ teamId, idList: deleteVectorIdList });
      }
      addLog.info(`[QuickTest] Done for ${data._id}`);

      items.push({
        collectionName: collectionMap.get(String(data.collectionId)) || '',
        articleTitle: extractArticleTitle(data.q),
        suggestedKeywords: parsed.indexes,
        previewQ: parsed.q
      });
      success++;
    } catch (err) {
      addLog.error(`[QuickTest] Error processing ${data._id}`, err);
      skipped++;
    }
  }

  return { success, skipped, items };
}

// 构建增强 Prompt（参考 convert_kb_csv.py 逻辑）
function buildEnhancePrompt(
  config: EnhanceQuickTestBody['config'],
  data: { q: string; a: string },
  title: string
): string {
  return `你是一名知识库索引生成专家。根据以下切片内容，生成检索信息。

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
标题：${title}
${data.a || data.q}

## 输出格式（纯 JSON，不要 markdown 标记）
{"q": "主题概括。自然提问1？自然提问2？", "indexes": "检索词1;检索词2;检索词3"}

## 示例
{"q": "放射诊疗建设项目需要进行职业病危害放射防护预评价审核。如何办理？需要哪些材料？", "indexes": "放射防护;预评价;职业病危害;卫生审批"}`;
}

// 解析 AI 返回结果
function parseEnhanceResult(text: string): { q: string; indexes: string[] } {
  try {
    // 尝试直接解析 JSON
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

// A 字段上下文头拼接（参考脚本 build_answer_with_context）
function buildAnswerWithContext(data: { q: string; a: string }, collectionName: string): string {
  const originalA = data.a || data.q;
  const title = collectionName || extractTitle(data.q);
  const chapter = extractChapter(data.q);
  const article = extractArticle(data.q);

  const header = [title, chapter, article].filter(Boolean).join(' | ');
  if (header) {
    return `【${header}】\n${originalA}`;
  }
  return originalA;
}

// A 字段上下文头拼接（直接传入 title/chapter/article）
function buildAnswerWithContextFull(
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

function extractArticleTitle(q: string): string {
  const chapter = extractChapter(q);
  const article = extractArticle(q);
  if (chapter && article) return `${chapter} ${article}`;
  if (article) return article;
  return extractTitle(q);
}

export default NextAPI(handler);
