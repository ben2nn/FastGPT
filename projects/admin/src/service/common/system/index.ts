/**
 * Admin 系统配置初始化
 * 从 MongoDB 加载系统配置并设置全局变量，供 getInitData API 使用
 */
import { getFastGPTConfigFromDB } from '@fastgpt/service/common/system/config/controller';
import { initFastGPTConfig } from '@fastgpt/service/common/system/tools';
import type { FastGPTConfigFileType } from '@fastgpt/global/common/system/types';
import { initHttpAgent } from '@fastgpt/service/common/middle/httpAgent';
import { POST } from '@fastgpt/service/common/api/plusRequest';
import { isProVersion } from '@fastgpt/service/common/system/constants';
import type {
  PushUsageItemsProps,
  ConcatUsageProps,
  CreateUsageProps
} from '@fastgpt/global/support/wallet/usage/api';
import type {
  DeepRagSearchProps,
  SearchDatasetDataResponse
} from '@fastgpt/service/core/dataset/search/controller';
import type { AuthOpenApiLimitProps } from '@fastgpt/service/support/openapi/auth';

const defaultFeConfigs = {
  show_emptyChat: true,
  show_git: true,
  docUrl: 'https://doc.fastgpt.io',
  systemTitle: 'FastGPT Admin',
  uploadFileMaxSize: Number(process.env.UPLOAD_FILE_MAX_SIZE || 1000),
  uploadFileMaxAmount: Number(process.env.UPLOAD_FILE_MAX_AMOUNT || 1000)
};

/**
 * 从数据库加载系统配置并初始化全局变量
 * 设置 global.feConfigs、global.systemVersion、global.systemInitBufferId 等
 */
export async function getInitConfig() {
  const getSystemVersion = async () => {
    if (global.systemVersion) return;
    try {
      global.systemVersion = process.env.npm_package_version || '0.0.0';
    } catch {
      global.systemVersion = '0.0.0';
    }
  };

  await Promise.all([initSystemConfig(), getSystemVersion()]);
}

async function initSystemConfig() {
  const { fastgptConfig } = await getFastGPTConfigFromDB();

  const config: FastGPTConfigFileType = {
    feConfigs: {
      ...defaultFeConfigs,
      ...(fastgptConfig.feConfigs || {})
    },
    systemEnv: {
      ...(fastgptConfig.systemEnv || {})
    },
    subPlans: fastgptConfig.subPlans
  };

  initFastGPTConfig(config);
}

/**
 * 初始化全局变量：HTTP 代理、用量处理函数等
 * 与主应用保持一致，确保 @fastgpt/service 中依赖 global handler 的功能正常工作
 */
export function initGlobalVariables() {
  function initPlusRequest() {
    global.textCensorHandler = function textCensorHandler({ text }: { text: string }) {
      if (!isProVersion()) return Promise.resolve({ code: 200 });
      return POST<{ code: number; message?: string }>('/common/censor/check', { text });
    };

    global.deepRagHandler = function deepRagHandler(data: DeepRagSearchProps) {
      return POST<SearchDatasetDataResponse>('/core/dataset/deepRag', data);
    };

    global.authOpenApiHandler = function authOpenApiHandler(data: AuthOpenApiLimitProps) {
      if (!isProVersion()) return Promise.resolve();
      return POST<AuthOpenApiLimitProps>('/support/openapi/authLimit', data);
    };

    global.createUsageHandler = function createUsageHandler(data: CreateUsageProps) {
      if (!isProVersion()) return;
      return POST<string>('/support/wallet/usage/createUsage', data);
    };
    global.concatUsageHandler = function concatUsageHandler(data: ConcatUsageProps) {
      if (!isProVersion()) return;
      return POST('/support/wallet/usage/concatUsage', data);
    };
    global.pushUsageItemsHandler = function pushUsageItemsHandler(data: PushUsageItemsProps) {
      if (!isProVersion()) return;
      return POST('/support/wallet/usage/pushUsageItems', data);
    };
  }

  global.datasetParseQueueLen = global.datasetParseQueueLen ?? 0;
  global.qaQueueLen = global.qaQueueLen ?? 0;
  global.vectorQueueLen = global.vectorQueueLen ?? 0;
  initHttpAgent();
  initPlusRequest();
}
