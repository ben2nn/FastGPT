import type {
  PushDatasetDataChunkProps,
  PushDatasetDataResponse
} from '@fastgpt/global/core/dataset/api';
import type {
  APIFileServer,
  FeishuServer,
  YuqueServer,
  ApiDatasetServerType,
  APIFileItemType
} from '@fastgpt/global/core/dataset/apiDataset/type';
import type {
  DatasetSearchModeEnum,
  DatasetTypeEnum,
  DatasetSourceReadTypeEnum,
  ImportDataSourceEnum,
  TrainingModeEnum,
  DatasetCollectionDataProcessModeEnum,
  ChunkTriggerConfigTypeEnum,
  ChunkSettingModeEnum,
  DataChunkSplitModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type {
  SearchDataResponseItemType,
  DatasetCollectionSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import type { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

/* ================= dataset ===================== */
export type CreateDatasetParams = {
  parentId?: string;
  type: DatasetTypeEnum;
  name: string;
  intro: string;
  avatar: string;
  vectorModel?: string;
  agentModel?: string;
  vlmModel?: string;
  apiDatasetServer?: ApiDatasetServerType;
};

export type RebuildEmbeddingProps = {
  datasetId: string;
  vectorModel: string;
};

export type GetDatasetListBody = {
  parentId: ParentIdType;
  type?: DatasetTypeEnum;
  searchKey?: string;
};

/* ================= collection ===================== */
export type CreateCollectionResponse = Promise<{
  collectionId: string;
  results: PushDatasetDataResponse;
}>;

export type UpdateDatasetCollectionParams = {
  id?: string;
  parentId?: string;
  name?: string;
  tags?: string[];
  forbid?: boolean;
  createTime?: Date;
  datasetId?: string;
  externalFileId?: string;
};

export type DelCollectionBody = {
  collectionIds: string[];
};

export type getTrainingDetailResponse = {
  trainingType: DatasetCollectionDataProcessModeEnum;
  advancedTraining: {
    customPdfParse: boolean;
    imageIndex: boolean;
    autoIndexes: boolean;
  };
  queuedCounts: Record<TrainingModeEnum, number>;
  trainingCounts: Record<TrainingModeEnum, number>;
  errorCounts: Record<TrainingModeEnum, number>;
  trainedCount: number;
};

/* ================= folder ===================== */
export type DatasetFolderCreateBody = {
  parentId?: string;
  name: string;
  intro: string;
};

/* ================= createWithFiles ===================== */
export type DatasetCreateWithFilesBody = {
  datasetParams: {
    name: string;
    avatar: string;
    parentId?: string;
    vectorModel?: string;
    agentModel?: string;
    vlmModel?: string;
  };
  files: {
    fileId: string;
    name: string;
  }[];
};

export type DatasetCreateWithFilesResponse = {
  datasetId: string;
  name: string;
  avatar: string;
  vectorModel: EmbeddingModelItemType;
};

/* ================= data ===================== */
export type InsertOneDatasetDataProps = PushDatasetDataChunkProps & {
  collectionId: string;
};

export type GetDatasetDataListProps = PaginationProps & {
  searchText?: string;
  collectionId: string;
};

export type DatasetDataListItemType = {
  _id: string;
  datasetId: string;
  collectionId: string;
  q: string;
  a?: string;
  chunkIndex?: number;
  imageId?: string;
  teamId?: string;
};

export type GetDatasetDataListRes = PaginationResponse<DatasetDataListItemType>;

export type GetQuoteDataProps =
  | { id: string }
  | ({ id: string; appId: string; chatId: string; chatItemDataId: string } & OutLinkChatAuthProps);

export type GetQuoteDataResponse = {
  collection: DatasetCollectionSchemaType;
  q: string;
  a?: string;
};

export type GetQuotePermissionResponse =
  | {
      datasetName: string;
      permission: { hasWritePer: boolean; hasReadPer: boolean };
    }
  | undefined;

/* -------------- search ---------------- */
export type SearchTestProps = {
  datasetId: string;
  text: string;
  [NodeInputKeyEnum.datasetSimilarity]?: number;
  [NodeInputKeyEnum.datasetMaxTokens]?: number;
  [NodeInputKeyEnum.datasetSearchMode]?: `${DatasetSearchModeEnum}`;
  [NodeInputKeyEnum.datasetSearchEmbeddingWeight]?: number;
  [NodeInputKeyEnum.datasetSearchUsingReRank]?: boolean;
  [NodeInputKeyEnum.datasetSearchRerankModel]?: string;
  [NodeInputKeyEnum.datasetSearchRerankWeight]?: number;
  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]?: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModel]?: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]?: string;
  [NodeInputKeyEnum.datasetDeepSearch]?: boolean;
  [NodeInputKeyEnum.datasetDeepSearchModel]?: string;
  [NodeInputKeyEnum.datasetDeepSearchMaxTimes]?: number;
  [NodeInputKeyEnum.datasetDeepSearchBg]?: string;
};

export type SearchTestResponse = {
  list: SearchDataResponseItemType[];
  duration: string;
  limit: number;
  searchMode: `${DatasetSearchModeEnum}`;
  usingReRank: boolean;
  similarity: number;
  queryExtensionModel?: string;
};

/* =========== training =========== */
export type getDatasetTrainingQueueResponse = {
  rebuildingCount: number;
  trainingCount: number;
};

export type rebuildEmbeddingBody = {
  datasetId: string;
  vectorModel: string;
};

export type PostPreviewFilesChunksProps = {
  datasetId: string;
  type: DatasetSourceReadTypeEnum;
  sourceId: string;
  customPdfParse?: boolean;
  overlapRatio: number;
  selector?: string;
  externalFileId?: string;
  trainingType?: DatasetCollectionDataProcessModeEnum;
  chunkTriggerType?: ChunkTriggerConfigTypeEnum;
  chunkTriggerMinSize?: number;
  chunkSettingMode?: ChunkSettingModeEnum;
  chunkSplitMode?: DataChunkSplitModeEnum;
  chunkSize?: number;
  chunkSplitter?: string;
  indexSize?: number;
  qaPrompt?: string;
};

export type PreviewChunksResponse = {
  chunks: { q: string; a: string }[];
  total: number;
};

export type updateTrainingDataBody = {
  datasetId: string;
  collectionId: string;
  dataId?: string;
  q?: string;
  a?: string;
  chunkIndex?: number;
};

export type getTrainingDataDetailBody = {
  datasetId: string;
  collectionId: string;
  dataId: string;
};

export type getTrainingDataDetailResponse =
  | {
      _id: string;
      datasetId: string;
      mode: string;
      q?: string;
      a?: string;
      imagePreviewUrl?: string;
    }
  | undefined;

export type deleteTrainingDataBody = {
  datasetId: string;
  collectionId: string;
  dataId: string;
};

export type getTrainingErrorBody = PaginationProps<{
  collectionId: string;
}>;

export type getTrainingErrorResponse = PaginationResponse<DatasetTrainingSchemaType>;

/* =========== apiDataset =========== */
export type GetApiDatasetFileListProps = {
  searchKey?: string;
  parentId?: ParentIdType;
  datasetId: string;
};

export type listExistIdQuery = {
  datasetId: string;
};

export type listExistIdResponse = string[];

export type GetApiDatasetCataLogProps = {
  parentId?: ParentIdType;
  apiDatasetServer?: ApiDatasetServerType;
};

export type GetApiDatasetCataLogResponse = APIFileItemType[];

export type GetApiDatasetPathBody = {
  datasetId?: string;
  parentId?: ParentIdType;
  apiDatasetServer?: ApiDatasetServerType;
};

export type GetApiDatasetPathResponse = string;

/* =========== collection read =========== */
export type readCollectionSourceBody = {
  collectionId: string;
  appId?: string;
  chatId?: string;
  chatItemDataId?: string;
} & OutLinkChatAuthProps;

export type readCollectionSourceResponse = {
  type: 'url';
  value: string;
};
