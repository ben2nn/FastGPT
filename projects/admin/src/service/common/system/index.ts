/**
 * Admin 系统配置初始化
 * 从 MongoDB 加载系统配置并设置全局变量，供 getInitData API 使用
 */
import { getFastGPTConfigFromDB } from '@fastgpt/service/common/system/config/controller';
import { initFastGPTConfig } from '@fastgpt/service/common/system/tools';
import type { FastGPTConfigFileType } from '@fastgpt/global/common/system/types';

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
