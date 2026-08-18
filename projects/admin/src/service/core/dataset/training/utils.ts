import { generateQA } from '@/service/core/dataset/queues/generateQA';
import { generateVector } from '@/service/core/dataset/queues/generateVector';
import { generateAutoIndex } from '@/service/core/dataset/queues/generateAutoIndex';
import { generateImageIndex } from '@/service/core/dataset/queues/generateImageIndex';
import { generateEnhanceIndex } from '@/service/core/dataset/queues/generateEnhanceIndex';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { datasetParseQueue } from '../queues/datasetParse';

// 常量独立存放于 constants.ts(避免队列模块反向依赖本文件的循环)
export {
  ADMIN_ONLY_LOCK_TIME,
  ADMIN_ONLY_LOCK_THRESHOLD,
  getAdminOnlyInitialExpireAt
} from './constants';

/**
 * 完整训练队列 Watch（app 使用，监听所有标准模式）
 */
export const createDatasetTrainingMongoWatch = () => {
  const changeStream = MongoDatasetTraining.watch();

  return changeStream.on('change', async (change) => {
    try {
      if (change.operationType === 'insert') {
        const fullDocument = change.fullDocument as DatasetTrainingSchemaType;
        const { mode } = fullDocument;
        if (mode === TrainingModeEnum.qa) {
          generateQA();
        } else if (mode === TrainingModeEnum.chunk) {
          generateVector();
        } else if (mode === TrainingModeEnum.parse) {
          datasetParseQueue();
        }
      }
    } catch (error) {}
  });
};

/**
 * Admin 专用 Watch（监听 enhance/auto/image/chunk 模式）
 * 注意：错误处理由调用方（mongoWatch.ts）统一管理
 */
export const createAdminTrainingMongoWatch = () => {
  const changeStream = MongoDatasetTraining.watch();

  return changeStream.on('change', async (change) => {
    try {
      if (change.operationType === 'insert') {
        const fullDocument = change.fullDocument as DatasetTrainingSchemaType;
        const { mode } = fullDocument;
        if (mode === TrainingModeEnum.enhance) {
          // enhance 模式：有 dataId 是索引增强，无 dataId 是文件解析
          if (fullDocument.dataId) {
            generateEnhanceIndex();
          } else {
            datasetParseQueue();
          }
        } else if (mode === TrainingModeEnum.auto) {
          generateAutoIndex();
        } else if (mode === TrainingModeEnum.image) {
          generateImageIndex();
        } else if (mode === TrainingModeEnum.chunk) {
          generateVector();
        }
      }
    } catch (error) {}
  });
};

/**
 * 完整训练队列启动（app 使用）
 */
export const startTrainingQueue = (fast?: boolean) => {
  const max = global.systemEnv?.qaMaxProcess || 10;

  for (let i = 0; i < (fast ? max : 1); i++) {
    generateQA();
    generateVector();
    datasetParseQueue();
  }
};

/**
 * Admin 专用训练队列启动（enhance + auto + image + vector）
 */
export const startAdminTrainingQueue = (fast?: boolean) => {
  const max = global.systemEnv?.datasetParseMaxProcess || 10;

  for (let i = 0; i < (fast ? max : 1); i++) {
    datasetParseQueue();
    generateAutoIndex();
    generateEnhanceIndex();
    generateImageIndex();
    generateVector();
  }
};
