import { useSystemStore } from './useSystemStore';
import type { EmbeddingModelItemType, LLMModelItemType } from '@fastgpt/global/core/ai/model.d';

export const getWebLLMModel = (model?: string) => {
  const list = useSystemStore.getState().llmModelList;
  const defaultModels = useSystemStore.getState().defaultModels;

  return list.find((item) => item.model === model || item.name === model) ?? defaultModels.llm!;
};

export const getWebDefaultLLMModel = (llmList: LLMModelItemType[] = []) => {
  const list = llmList.length > 0 ? llmList : useSystemStore.getState().llmModelList;
  const defaultModels = useSystemStore.getState().defaultModels;

  return defaultModels.llm && list.find((item) => item.model === defaultModels.llm?.model)
    ? defaultModels.llm
    : list[0];
};

export const getWebDefaultEmbeddingModel = (embeddingList: EmbeddingModelItemType[] = []) => {
  const list =
    embeddingList.length > 0 ? embeddingList : useSystemStore.getState().embeddingModelList;
  const defaultModels = useSystemStore.getState().defaultModels;

  return defaultModels.embedding &&
    list.find((item) => item.model === defaultModels.embedding?.model)
    ? defaultModels.embedding
    : list[0];
};

export const downloadFetch = async ({
  url,
  filename,
  body
}: {
  url: string;
  filename: string;
  body?: Record<string, any>;
}) => {
  const fetchOptions: RequestInit = {
    credentials: 'include'
  };

  if (body) {
    fetchOptions.method = 'POST';
    fetchOptions.headers = { 'Content-Type': 'application/json' };
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);
  if (!response.ok) throw new Error('下载失败');
  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(downloadUrl);
};
