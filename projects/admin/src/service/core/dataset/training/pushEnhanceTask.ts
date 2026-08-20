/**
 * 单条数据增量增强入队
 *
 * insertData / update 接口联动:数据插入/更新成功后调用本函数,
 * 将单条数据推入 mode=enhance 训练队列(admin 专属 lockTime 标记),
 * 由 generateEnhanceIndex 异步拾取进行 Q-A-Index 增强。
 *
 * 与批量 enhanceIndexes 的差异:
 * - 只入队一条(增量),不复用批量账单
 * - 不创建 training 账单(产品决策),队列处理时 checkTeamAiPointsAndLock 余额检查仍生效
 *
 * 注意:仅使用 @fastgpt 与相对路径 import(避免 @ 别名),
 * 供根目录 vitest 直接单测(test/cases/service/dataset/pushEnhanceTask.test.ts)。
 */
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import { addLog } from '@fastgpt/service/common/system/log';
import { ADMIN_ONLY_LOCK_TIME, getAdminOnlyInitialExpireAt } from './constants';

// 与批量 enhanceIndexes 的默认 chunkLimit 一致
const DEFAULT_CHUNK_LIMIT = 8000;

export async function pushEnhanceTaskForData({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  dataId,
  q,
  a,
  chunkIndex,
  indexes
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  dataId: string;
  q?: string;
  a?: string;
  chunkIndex?: number;
  indexes?: Omit<DatasetDataIndexItemType, 'dataId'>[];
}): Promise<boolean> {
  try {
    // 1. 空内容跳过:队列处理器对空 q 任务会直接删除,不入队更干净
    if (!q?.trim()) {
      addLog.info(`[EnhanceIndex] Skip push data ${dataId}: q is empty`);
      return false;
    }
    // 2. 超长切片跳过(与批量 chunkLimit 一致)
    if (q.length > DEFAULT_CHUNK_LIMIT) {
      addLog.info(`[EnhanceIndex] Skip push data ${dataId}: q too long (${q.length})`);
      return false;
    }
    // 3. 去重:同 dataId 已有待处理 enhance 任务时跳过,避免重复 LLM 调用
    const existing = await MongoDatasetTraining.findOne({
      dataId,
      mode: TrainingModeEnum.enhance,
      retryCount: { $gt: 0 }
    });
    if (existing) {
      addLog.info(`[EnhanceIndex] Skip push data ${dataId}: pending enhance task exists`);
      return false;
    }

    // 4. 清除 summary/question 类型索引(与批量逻辑一致)
    const safeIndexes = (indexes || []).filter(
      (idx) =>
        idx.type !== DatasetDataIndexTypeEnum.summary &&
        idx.type !== DatasetDataIndexTypeEnum.question
    );

    // 5. 入队:admin 专属 lockTime(app 队列不可见)+ 立即可拾取的 expireAt
    await MongoDatasetTraining.create({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      mode: TrainingModeEnum.enhance,
      dataId,
      q: q || '',
      a: a || '',
      chunkIndex: chunkIndex ?? 0,
      indexes: safeIndexes,
      retryCount: 50,
      lockTime: ADMIN_ONLY_LOCK_TIME,
      expireAt: getAdminOnlyInitialExpireAt()
    });

    addLog.info(`[EnhanceIndex] Pushed data ${dataId} to enhance queue`);
    return true;
  } catch (err) {
    // 入队失败不向上抛:数据插入/更新已成功,增强是尽力而为的后台任务
    addLog.error(`[EnhanceIndex] Push data ${dataId} failed`, err);
    return false;
  }
}
