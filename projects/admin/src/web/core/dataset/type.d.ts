import type { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api';
import type { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ChunkSettingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { UseFormReturn } from 'react-hook-form';
import type { APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';

export type ImportSourceItemType = {
  id: string;

  createStatus: 'waiting' | 'creating' | 'finish';
  metadata?: Record<string, any>;
  errorMsg?: string;

  // 索引增强进度（立即执行模式）
  enhanceProgress?: {
    current: number;
    total: number;
    phase: string;
    message?: string;
  };

  // 索引增强进度
  enhanceProgress?: {
    current: number;
    total: number;
    phase: string;
    message?: string;
  };

  // source
  sourceName: string;
  icon: string;

  // file
  sourceSize?: string;
  isUploading?: boolean;
  uploadedFileRate?: number;
  dbFileId?: string; // 存储在数据库里的文件Id

  file?: File; // Local file

  // link
  link?: string;

  // custom text
  rawText?: string;

  // external file
  externalFileUrl?: string;
  externalFileId?: string;

  // api dataset
  apiFileId?: string;
  apiFile?: APIFileItemType;
};

export type ImportSourceParamsType = UseFormReturn<
  {
    chunkSize: number;
    chunkOverlapRatio: number;
    chunkSplitter: string;
    prompt: string;
    mode: TrainingModeEnum;
    way: ChunkSettingModeEnum;
  },
  any
>;
