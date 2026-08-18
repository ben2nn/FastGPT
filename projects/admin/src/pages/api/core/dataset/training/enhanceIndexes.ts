/**
 * 批量索引增强 API
 * 将已有数据推入 mode=enhance 训练队列，由 generateEnhanceIndex 处理
 */
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel, getEmbeddingModel, getVlmModel } from '@fastgpt/service/core/ai/model';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addLog } from '@fastgpt/service/common/system/log';
import { setEnhanceConfig } from '@/service/core/dataset/enhanceConfigCache';
import type { EnhanceRuleConfig } from '@/pageComponents/dataset/detail/IndexEnhance/types';

export type enhanceIndexesBody = {
  datasetId: string;
  collectionId?: string;
  collectionIds?: string[];
  config?: EnhanceRuleConfig; // 增强配置（可选，用于自定义 Prompt）
};

async function handler(req: ApiRequestProps<enhanceIndexesBody>) {
  const { datasetId, collectionId, collectionIds, config } = req.body;

  if (!datasetId) {
    return Promise.reject('缺少 datasetId');
  }

  // 鉴权（需要写权限）
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });

  // 构建查询条件
  const dataQuery: Record<string, any> = { teamId, datasetId };
  const trainQuery: Record<string, any> = { teamId, datasetId };
  if (collectionIds && collectionIds.length > 0) {
    dataQuery.collectionId = { $in: collectionIds };
    trainQuery.collectionId = { $in: collectionIds };
  } else if (collectionId) {
    dataQuery.collectionId = collectionId;
    trainQuery.collectionId = collectionId;
  }

  // 检查是否正在训练
  const existingTraining = await MongoDatasetTraining.findOne(trainQuery);
  if (existingTraining) {
    return Promise.reject('数据集正在训练中，请稍后再试');
  }

  // 创建账单
  const { usageId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: '索引增强',
    billSource: UsageSourceEnum.training,
    vectorModel: getEmbeddingModel(dataset.vectorModel)?.name,
    agentModel: getLLMModel(dataset.agentModel)?.name,
    vllmModel: getVlmModel(dataset.vlmModel)?.name
  });

  // 缓存配置（供 generateEnhanceIndex 异步读取）
  if (config) {
    setEnhanceConfig(datasetId, config);
  }

  // 分批推入 enhance 训练队列
  const batchSize = 500;
  const chunkLimit = config?.aiIndexConfig?.chunkLimit || 8000;
  let totalInserted = 0;
  let skip = 0;

  while (true) {
    const batch = await MongoDatasetData.find(dataQuery)
      .sort({ _id: 1 }) // 稳定排序：增强处理会并发更新数据行，无排序的 skip 分页可能重复/遗漏扫描
      .skip(skip)
      .limit(batchSize)
      .select({ _id: 1, collectionId: 1, q: 1, a: 1, chunkIndex: 1, indexes: 1 })
      .lean();

    if (batch.length === 0) break;

    const trainingDocs = batch
      .filter((data) => {
        // 跳过超长切片
        if (data.q && data.q.length > chunkLimit) return false;
        return true;
      })
      .map((data) => {
        // 清除已有的 summary/question 类型索引，避免重复
        const existingIndexes = (data.indexes || []).filter(
          (idx: any) =>
            idx.type !== DatasetDataIndexTypeEnum.summary &&
            idx.type !== DatasetDataIndexTypeEnum.question
        );

        return {
          teamId,
          tmbId,
          datasetId,
          collectionId: data.collectionId,
          billId: usageId,
          mode: TrainingModeEnum.enhance,
          dataId: data._id,
          q: data.q,
          a: data.a,
          chunkIndex: data.chunkIndex,
          indexes: existingIndexes,
          retryCount: 50
        };
      });

    if (trainingDocs.length > 0) {
      await MongoDatasetTraining.insertMany(trainingDocs, { ordered: true });
    }

    totalInserted += trainingDocs.length;
    skip += batch.length;

    addLog.info(`[EnhanceIndexes] Progress: ${totalInserted}`);

    if (batch.length < batchSize) break;
  }

  addLog.info(`[EnhanceIndexes] Done`, { totalInserted });

  return { insertLen: totalInserted, billId: usageId };
}

export default NextAPI(handler);
