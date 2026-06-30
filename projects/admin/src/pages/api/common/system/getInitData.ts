import type { NextApiResponse } from 'next';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authAdmin } from '@/service/support/permission/auth';
import type { SystemDefaultModelType, SystemModelItemType } from '@fastgpt/service/core/ai/type';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import type {
  AiproxyMapProviderType,
  I18nStringStrictType
} from '@fastgpt/global/sdk/fastgpt-plugin';

export type InitDateResponse = {
  bufferId?: string;

  feConfigs?: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion?: string;

  activeModelList?: SystemModelItemType[];
  defaultModels?: SystemDefaultModelType;
  modelProviders?: { provider: string; value: I18nStringStrictType; avatar: string }[];
  aiproxyIdMap?: AiproxyMapProviderType;
};

async function handler(
  req: ApiRequestProps<{}, { bufferId?: string }>,
  res: NextApiResponse
): Promise<InitDateResponse> {
  const { bufferId } = req.query;

  // 使用 Redis Session 认证（与 app 项目统一）
  await authAdmin(req);

  // bufferId 缓存优化
  if (bufferId && global.systemInitBufferId && global.systemInitBufferId === bufferId) {
    return {
      bufferId: global.systemInitBufferId,
      systemVersion: global.systemVersion
    };
  }

  return {
    bufferId: global.systemInitBufferId,
    feConfigs: global.feConfigs,
    subPlans: global.subPlans,
    systemVersion: global.systemVersion,
    activeModelList: global.systemActiveDesensitizedModels,
    defaultModels: global.systemDefaultModel,
    modelProviders: global.ModelProviderRawCache,
    aiproxyIdMap: global.aiproxyIdMapCache
  };
}

export default NextAPI(handler);
