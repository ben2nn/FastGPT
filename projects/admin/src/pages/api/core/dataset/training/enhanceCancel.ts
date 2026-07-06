import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/dataset/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { clearEnhanceConfig } from '@/service/core/dataset/enhanceConfigCache';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type {
  EnhanceCancelBody,
  EnhanceCancelResponse
} from '@/pageComponents/dataset/detail/IndexEnhance/types';

async function handler(
  req: ApiRequestProps<EnhanceCancelBody>,
  _res: NextApiResponse
): Promise<EnhanceCancelResponse> {
  const { billId, datasetId } = req.body;

  if (!billId || !datasetId) {
    return Promise.reject('缺少必要参数');
  }

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });

  // 1. 删除本次增强写入的所有 pending 训练任务
  const result = await MongoDatasetTraining.deleteMany({ billId, teamId });

  // 2. 清除配置缓存
  clearEnhanceConfig(datasetId);

  return { deletedCount: result.deletedCount || 0 };
}

export default NextAPI(handler);
