/* Dataset collection source parse, not max size. */

import { ParagraphChunkAIModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  DatasetSourceReadTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type {
  DatasetCollectionSchemaType,
  DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { checkTeamAiPointsAndLock } from './utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/service/common/bullmq';
import { rawText2Chunks, readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { getLLMMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
/**
 * Admin 专用路由：不检查 isPlus
 */
const getAdminTrainingMode = (collection: {
  trainingType: DatasetCollectionDataProcessModeEnum;
  autoIndexes?: boolean;
  imageIndex?: boolean;
}): TrainingModeEnum => {
  if (collection.trainingType === DatasetCollectionDataProcessModeEnum.imageParse)
    return TrainingModeEnum.imageParse;
  if (collection.trainingType === DatasetCollectionDataProcessModeEnum.qa)
    return TrainingModeEnum.qa;
  if (
    collection.trainingType === DatasetCollectionDataProcessModeEnum.chunk &&
    collection.imageIndex
  )
    return TrainingModeEnum.image;
  if (
    collection.trainingType === DatasetCollectionDataProcessModeEnum.chunk &&
    collection.autoIndexes
  )
    return TrainingModeEnum.auto;
  return TrainingModeEnum.chunk;
};
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { ADMIN_ONLY_LOCK_TIME } from '@/service/core/dataset/training/constants';
import { findTrainingTaskWithAdminFallback } from '@/service/core/dataset/training/queuePick';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { POST } from '@fastgpt/service/common/api/plusRequest';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';

const requestLLMPargraph = async ({
  rawText,
  model,
  billId,
  paragraphChunkAIMode
}: {
  rawText: string;
  model: string;
  billId: string;
  paragraphChunkAIMode?: ParagraphChunkAIModeEnum;
}) => {
  if (!paragraphChunkAIMode || paragraphChunkAIMode === ParagraphChunkAIModeEnum.forbid) {
    return { resultText: rawText, totalInputTokens: 0, totalOutputTokens: 0 };
  }
  if (paragraphChunkAIMode === ParagraphChunkAIModeEnum.auto) {
    const hasMarkdownHeaders = /^(#+)\s/m.test(rawText);
    const hasMultipleHeaders = (rawText.match(/^(#+)\s/g) || []).length > 1;
    if (hasMarkdownHeaders && hasMultipleHeaders) {
      return { resultText: rawText, totalInputTokens: 0, totalOutputTokens: 0 };
    }
  }
  try {
    const { answerText, usage } = await POST<{
      answerText: string;
      usage: { inputTokens: number; outputTokens: number };
    }>('/core/dataset/training/llmPargraph', {
      rawText,
      model,
      billId,
      paragraphChunkAIMode
    });
    return {
      resultText: answerText,
      totalInputTokens: usage.inputTokens,
      totalOutputTokens: usage.outputTokens
    };
  } catch (error) {
    addLog.warn(`[Parse Queue] LLM Paragraph failed`, error);
    return { resultText: rawText, totalInputTokens: 0, totalOutputTokens: 0 };
  }
};

const reduceQueue = () => {
  global.datasetParseQueueLen =
    global.datasetParseQueueLen > 0 ? global.datasetParseQueueLen - 1 : 0;
  return global.datasetParseQueueLen === 0;
};

export const datasetParseQueue = async (): Promise<any> => {
  const max = global.systemEnv?.datasetParseMaxProcess || 10;
  addLog.debug(`[Parse Queue] Queue size: ${global.datasetParseQueueLen}`);
  if (global.datasetParseQueueLen >= max) return;
  global.datasetParseQueueLen++;

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
            // 排除索引增强任务(有 dataId 的)
            extraFilter: { dataId: { $exists: false } },
            coolMinutes: 10,
            populate: (query) =>
              query
                .populate<{
                  dataset: DatasetSchemaType;
                  collection: DatasetCollectionSchemaType;
                }>([
                  {
                    path: 'collection',
                    select: '-qaPrompt'
                  },
                  {
                    path: 'dataset'
                  }
                ])
                .lean()
          });
          if (!data) return { done: true };
          return { data };
        } catch (error) {
          return { error: true };
        }
      })();

      if (done || !data) break;
      if (error) {
        addLog.error(`[Parse Queue] Error`, error);
        await delay(500);
        continue;
      }
      if (!(await checkTeamAiPointsAndLock(data.teamId))) continue;

      const dataset = data.dataset;
      const collection = data.collection;
      if (!dataset || !collection) {
        addLog.warn(`[Parse Queue] data not found`, data);
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }

      addLog.info(`[Parse Queue] Start`);

      try {
        const trainingMode = getAdminTrainingMode({
          trainingType: collection.trainingType,
          autoIndexes: collection.autoIndexes,
          imageIndex: collection.imageIndex
        });

        // 1. Parse rawtext
        const sourceReadType = await (async () => {
          if (collection.type === DatasetCollectionTypeEnum.link) {
            if (!collection.rawLink) return Promise.reject('rawLink is missing');
            return {
              type: DatasetSourceReadTypeEnum.link,
              sourceId: collection.rawLink,
              selector: collection.metadata?.webPageSelector
            };
          }
          if (collection.type === DatasetCollectionTypeEnum.file) {
            if (!collection.fileId) return Promise.reject('fileId is missing');
            return {
              type: DatasetSourceReadTypeEnum.fileLocal,
              sourceId: String(collection.fileId)
            };
          }
          if (collection.type === DatasetCollectionTypeEnum.apiFile) {
            if (!collection.apiFileId) return Promise.reject('apiFileId is missing');
            return {
              type: DatasetSourceReadTypeEnum.apiFile,
              sourceId: collection.apiFileId,
              apiDatasetServer: dataset.apiDatasetServer
            };
          }
          if (collection.type === DatasetCollectionTypeEnum.externalFile) {
            if (!collection.externalFileUrl) return Promise.reject('externalFileId is missing');
            return {
              type: DatasetSourceReadTypeEnum.externalFile,
              sourceId: collection.externalFileUrl,
              externalFileId: collection.externalFileId
            };
          }
          return Promise.reject('Collection type not support parse');
        })();

        const { title, rawText } = await readDatasetSourceRawText({
          teamId: data.teamId,
          tmbId: data.tmbId,
          customPdfParse: collection.customPdfParse,
          usageId: data.billId,
          datasetId: data.datasetId,
          ...sourceReadType
        });

        // 2. LLM Paragraph
        const { resultText, totalInputTokens, totalOutputTokens } = await requestLLMPargraph({
          rawText,
          model: dataset.agentModel,
          billId: data.billId,
          paragraphChunkAIMode: collection.paragraphChunkAIMode
        });
        // 跳过计费（admin 未部署商业版计费服务）

        // 3. Chunk split
        const chunks = await rawText2Chunks({
          rawText: resultText,
          chunkTriggerType: collection.chunkTriggerType,
          chunkTriggerMinSize: collection.chunkTriggerMinSize,
          chunkSize: collection.chunkSize,
          paragraphChunkDeep: collection.paragraphChunkDeep,
          paragraphChunkMinSize: collection.paragraphChunkMinSize,
          maxSize: getLLMMaxChunkSize(getLLMModel(dataset.agentModel)),
          overlapRatio:
            collection.trainingType === DatasetCollectionDataProcessModeEnum.chunk ? 0.2 : 0,
          customReg: collection.chunkSplitter ? [collection.chunkSplitter] : [],
          backupParse: collection.trainingType === DatasetCollectionDataProcessModeEnum.backup
        });

        // Check dataset limit
        try {
          await checkDatasetIndexLimit({
            teamId: data.teamId,
            insertLen: predictDataLimitLength(trainingMode, chunks)
          });
        } catch (error) {
          addLog.info(`[Parse Queue] Check dataset limit failed, lock the task`);
          await MongoDatasetTraining.updateOne(
            { _id: data._id },
            { errorMsg: getErrText(error, 'Over dataset limit'), lockTime: new Date('2999/5/5') }
          );
        }

        await mongoSessionRun(async (session) => {
          // 4. Update collection
          await MongoDatasetCollection.updateOne(
            { _id: collection._id },
            {
              ...(title && { name: title }),
              rawTextLength: resultText.length,
              hashRawText: hashStr(resultText)
            },
            { session }
          );

          // 5. Push to training queue
          const trainingData = chunks.map((item, index) => ({
            ...item,
            indexes: item.indexes?.map((text) => ({
              type: DatasetDataIndexTypeEnum.custom,
              text
            })),
            chunkIndex: index
          }));

          await pushDataListToTrainingQueue({
            teamId: data.teamId,
            tmbId: data.tmbId,
            datasetId: dataset._id,
            collectionId: collection._id,
            agentModel: dataset.agentModel,
            vectorModel: dataset.vectorModel,
            vlmModel: dataset.vlmModel,
            indexSize: collection.indexSize,
            mode: trainingMode,
            billId: data.billId,
            data: trainingData,
            session,
            // admin 专属任务:app 队列不拾取
            lockTime: ADMIN_ONLY_LOCK_TIME
          });

          // 6. Delete task
          await MongoDatasetTraining.deleteOne({ _id: data._id }, { session });
        });

        addLog.debug(`[Parse Queue] Finish`, { time: Date.now() - startTime });
      } catch (err) {
        addLog.error(`[Parse Queue] Error`, err);
        await MongoDatasetTraining.updateOne(
          { _id: data._id },
          { errorMsg: getErrText(err, 'unknown error') }
        );
        await delay(100);
      }
    }
  } catch (error) {
    addLog.error(`[Parse Queue] Error`, error);
  }

  if (reduceQueue()) {
    addLog.info(`[Parse Queue] Done`);
  }
  addLog.debug(`[Parse Queue] break loop`);
};
