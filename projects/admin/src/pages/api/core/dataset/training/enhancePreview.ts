import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/dataset/constant';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type {
  EnhancePreviewBody,
  EnhancePreviewResponse,
  EnhancePreviewRow
} from '@/pageComponents/dataset/detail/IndexEnhance/types';

async function handler(
  req: ApiRequestProps<EnhancePreviewBody>,
  _res: NextApiResponse
): Promise<EnhancePreviewResponse> {
  const { datasetId, collectionIds } = req.body;

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  // 查询已有数据
  const query: Record<string, any> = { teamId, datasetId };
  if (collectionIds?.length) {
    query.collectionId = { $in: collectionIds };
  }

  const totalCount = await MongoDatasetData.countDocuments(query);

  const dataList = await MongoDatasetData.find(query).sort({ chunkIndex: 1 }).lean();

  // 批量查询集合名称
  const collectionIdsSet = new Set(dataList.map((d) => String(d.collectionId)));
  const collections = await MongoDatasetCollection.find(
    { _id: { $in: Array.from(collectionIdsSet) } },
    { name: 1 }
  ).lean();
  const collectionMap = new Map(collections.map((c) => [String(c._id), c.name]));

  // 用模板填充 Q/A/Index（不调用 AI）
  const previewRows: EnhancePreviewRow[] = dataList.map((data) => {
    const collectionName = collectionMap.get(String(data.collectionId)) || '';

    return {
      originalQ: data.q,
      originalA: stripHtml(data.a || ''),
      previewQ: buildTemplateQ(data, { collectionName }),
      previewA: buildTemplateA(data, { collectionName }),
      previewIndexes: buildTemplateIndexes(data, { collectionName })
    };
  });

  return { totalChunks: totalCount, previewRows };
}

// Q 字段预览（参考脚本 dry-run 模式）
function buildTemplateQ(
  data: { q: string; a: string },
  config: { collectionName: string }
): string {
  const title = extractTitle(data.q);
  const article = extractArticle(data.q);
  const chapter = extractChapter(data.q);

  // 模拟脚本的 dry-run 模板
  if (article) {
    return `《${title}》${article}规定了什么？ [AI 生成摘要和提问]`;
  }
  if (chapter) {
    return `《${title}》${chapter}的主要内容？ [AI 生成摘要和提问]`;
  }
  return `${title}的主要内容？ [AI 生成摘要和提问]`;
}

// A 字段预览（参考脚本 build_answer_with_context）
function buildTemplateA(
  data: { q: string; a: string },
  config: { collectionName: string }
): string {
  const originalA = stripHtml(data.a || data.q);
  const title = extractTitle(data.q);
  const chapter = extractChapter(data.q);
  const article = extractArticle(data.q);

  const header = [title, chapter, article].filter(Boolean).join(' | ');
  if (header) {
    return `【${header}】\n${originalA}`;
  }
  return originalA;
}

// Index 字段预览（参考脚本 indexes 生成）
function buildTemplateIndexes(
  data: { q: string; a: string },
  config: { collectionName: string }
): string[] {
  return ['[AI 生成 6-10 个检索标签]'];
}

// 从原始 q 字段提取标题（清理 md/html 标签，取第一行前 30 字）
function extractTitle(q: string): string {
  const firstLine = q.split('\n')[0]?.trim() || '';
  // 清理 markdown 标记：#标题、**粗体**、*斜体*、`代码`、[链接](url)、![图片](url)
  let clean = firstLine
    .replace(/^#{1,6}\s*/, '') // # 标题
    .replace(/\*\*(.*?)\*\*/g, '$1') // **粗体**
    .replace(/\*(.*?)\*/g, '$1') // *斜体*
    .replace(/`([^`]*)`/g, '$1') // `代码`
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // ![图片](url)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [链接](url)
    .replace(/~~(.*?)~~/g, '$1') // ~~删除线~~
    // 清理 html 标签
    .replace(/<[^>]+>/g, '')
    // 清理多余空白
    .replace(/\s+/g, ' ')
    .trim();
  return clean.slice(0, 30);
}

// 去掉 HTML 标签，保留纯文本
function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n') // <br> → 换行
    .replace(/<\/?(p|div|li|h[1-6])[^>]*>/gi, '\n') // 块级标签 → 换行
    .replace(/<[^>]+>/g, '') // 去掉其他所有标签
    .replace(/&nbsp;/g, ' ') // &nbsp; → 空格
    .replace(/&lt;/g, '<') // &lt; → <
    .replace(/&gt;/g, '>') // &gt; → >
    .replace(/&amp;/g, '&') // &amp; → &
    .replace(/\n{3,}/g, '\n\n') // 多个空行合并
    .trim();
}

// 从原始 q 字段提取章节（匹配"第X章"）
function extractChapter(q: string): string {
  const match = q.match(/第[一二三四五六七八九十百千\d]+章[^\n]*/);
  return match ? match[0].trim() : '';
}

// 从原始 q 字段提取条号（匹配"第X条"）
function extractArticle(q: string): string {
  const match = q.match(/第[一二三四五六七八九十百千\d]+条/);
  return match ? match[0] : '';
}

export default NextAPI(handler);
