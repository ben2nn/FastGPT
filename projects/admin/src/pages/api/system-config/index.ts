import { connectToDatabase } from '@/service/common/mongo';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';
import { NextAPI } from '@/service/middleware/entry';
import type { CommercialFeatureForm } from '@/types/systemConfig';
import fs from 'fs';
import path from 'path';
import json5 from 'json5';

/**
 * 更新 config.json 文件
 * 确保即使没有 PRO_URL 环境变量，配置也能生效
 */
async function updateConfigJsonFile(
  feConfigs: Record<string, any>,
  license: CommercialFeatureForm['license']
) {
  // config.json 路径 - 开发环境和生产环境不同
  const configPaths = [
    path.join(process.cwd(), '../app/data/config.json'), // admin 目录的上级
    path.join(process.cwd(), '../../projects/app/data/config.json'), // 从 monorepo 根目录
    '/app/data/config.json' // 生产环境 Docker
  ];

  let configPath = '';
  for (const p of configPaths) {
    if (fs.existsSync(p)) {
      configPath = p;
      break;
    }
  }

  if (!configPath) {
    addLog.warn('config.json not found, skipping file update');
    return;
  }

  // 读取现有配置
  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config = json5.parse(configContent);

  // 更新 feConfigs（保留原有配置，只更新修改的部分）
  config.feConfigs = {
    ...(config.feConfigs || {}),
    ...feConfigs
  };

  // 写入文件（带注释的 JSON5 格式）
  const updatedContent = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, updatedContent, 'utf-8');

  addLog.info(`config.json updated at: ${configPath}`);
}

type GetResponse = {
  success: boolean;
  data?: CommercialFeatureForm;
  error?: string;
};

type PutRequestBody = CommercialFeatureForm;

type PutResponse = {
  success: boolean;
  error?: string;
};

/**
 * 获取当前系统配置
 */
async function getHandler(req: ApiRequestProps, res: ApiResponseType<GetResponse>) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    await connectToDatabase();

    // 并行查询 license 和 fastgpt 配置
    const [licenseConfig, fastgptConfig] = await Promise.all([
      MongoSystemConfigs.findOne({ type: SystemConfigsTypeEnum.license }).sort({ createTime: -1 }),
      MongoSystemConfigs.findOne({ type: SystemConfigsTypeEnum.fastgpt }).sort({ createTime: -1 })
    ]);

    const licenseData = licenseConfig?.value?.data;
    const feConfigs = fastgptConfig?.value?.feConfigs || {};

    // 构建表单数据
    const formData: CommercialFeatureForm = {
      license: {
        enabled: !!licenseData,
        company: licenseData?.company || '',
        description: licenseData?.description || '',
        expiredTime: licenseData?.expiredTime || '',
        maxUsers: licenseData?.maxUsers || 0,
        maxApps: licenseData?.maxApps || 0,
        maxDatasets: licenseData?.maxDatasets || 0,
        functions: {
          sso: licenseData?.functions?.sso || false,
          pay: licenseData?.functions?.pay || false,
          customTemplates: licenseData?.functions?.customTemplates || false,
          datasetEnhance: licenseData?.functions?.datasetEnhance || false,
          batchEval: licenseData?.functions?.batchEval || false
        }
      },
      features: {
        // 发布渠道
        show_publish_feishu: feConfigs.show_publish_feishu ?? true,
        show_publish_dingtalk: feConfigs.show_publish_dingtalk ?? true,
        show_publish_wecom: feConfigs.show_publish_wecom ?? false,
        show_publish_offiaccount: feConfigs.show_publish_offiaccount ?? true,
        // 数据集
        show_dataset_feishu: feConfigs.show_dataset_feishu ?? true,
        show_dataset_yuque: feConfigs.show_dataset_yuque ?? true,
        show_dataset_enhance: feConfigs.show_dataset_enhance ?? false,
        // 其他功能
        show_batch_eval: feConfigs.show_batch_eval ?? false,
        show_pay: feConfigs.show_pay ?? false,
        show_promotion: feConfigs.show_promotion ?? false,
        show_team_chat: feConfigs.show_team_chat ?? false,
        show_appStore: feConfigs.show_appStore ?? true,
        show_aiproxy: feConfigs.show_aiproxy ?? false,
        show_coupon: feConfigs.show_coupon ?? false,
        show_discount_coupon: feConfigs.show_discount_coupon ?? false,
        show_git: feConfigs.show_git ?? true,
        show_openai_account: feConfigs.show_openai_account ?? false,
        show_compliance_copywriting: feConfigs.show_compliance_copywriting ?? false,
        showWecomConfig: feConfigs.showWecomConfig ?? false,
        // 界面配置
        show_emptyChat: feConfigs.show_emptyChat ?? true,
        hideChatCopyrightSetting: feConfigs.hideChatCopyrightSetting ?? false,
        // 文案配置
        systemTitle: feConfigs.systemTitle || '',
        docUrl: feConfigs.docUrl || '',
        openAPIDocUrl: feConfigs.openAPIDocUrl || '',
        submitPluginRequestUrl: feConfigs.submitPluginRequestUrl || '',
        appTemplateCourse: feConfigs.appTemplateCourse || '',
        concatMd: feConfigs.concatMd || '',
        payFormUrl: feConfigs.payFormUrl || '',
        // 限制配置
        exportDatasetLimitMinutes: feConfigs.limit?.exportDatasetLimitMinutes || 0,
        websiteSyncLimitMinuted: feConfigs.limit?.websiteSyncLimitMinuted || 0
      }
    };

    return res.status(200).json({ success: true, data: formData });
  } catch (error) {
    addLog.error('Get system config error:', error);
    return res.status(500).json({ success: false, error: '服务器错误，请稍后重试' });
  }
}

/**
 * 更新系统配置
 */
async function putHandler(req: ApiRequestProps<PutRequestBody>, res: ApiResponseType<PutResponse>) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['PUT']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    await connectToDatabase();

    const formData = req.body;

    // 1. 更新或创建 license 配置
    if (formData.license.enabled) {
      const licenseValue = {
        data: {
          startTime: new Date().toISOString(),
          expiredTime: formData.license.expiredTime || '2099-12-31',
          company: formData.license.company || 'Admin',
          description: formData.license.description,
          maxUsers: formData.license.maxUsers || undefined,
          maxApps: formData.license.maxApps || undefined,
          maxDatasets: formData.license.maxDatasets || undefined,
          functions: formData.license.functions
        }
      };

      const existingLicense = await MongoSystemConfigs.findOne({
        type: SystemConfigsTypeEnum.license
      }).sort({ createTime: -1 });

      if (existingLicense) {
        existingLicense.value = licenseValue;
        existingLicense.createTime = new Date();
        await existingLicense.save();
      } else {
        await MongoSystemConfigs.create({
          type: SystemConfigsTypeEnum.license,
          value: licenseValue,
          createTime: new Date()
        });
      }
    } else {
      // 禁用 license - 删除配置
      await MongoSystemConfigs.deleteMany({ type: SystemConfigsTypeEnum.license });
    }

    // 2. 更新 fastgpt 配置
    const feConfigs = {
      show_publish_feishu: formData.features.show_publish_feishu,
      show_publish_dingtalk: formData.features.show_publish_dingtalk,
      show_publish_wecom: formData.features.show_publish_wecom,
      show_publish_offiaccount: formData.features.show_publish_offiaccount,
      show_dataset_feishu: formData.features.show_dataset_feishu,
      show_dataset_yuque: formData.features.show_dataset_yuque,
      show_dataset_enhance: formData.features.show_dataset_enhance,
      show_batch_eval: formData.features.show_batch_eval,
      show_pay: formData.features.show_pay,
      show_promotion: formData.features.show_promotion,
      show_team_chat: formData.features.show_team_chat,
      show_appStore: formData.features.show_appStore,
      show_aiproxy: formData.features.show_aiproxy,
      show_coupon: formData.features.show_coupon,
      show_discount_coupon: formData.features.show_discount_coupon,
      show_git: formData.features.show_git,
      show_openai_account: formData.features.show_openai_account,
      show_compliance_copywriting: formData.features.show_compliance_copywriting,
      showWecomConfig: formData.features.showWecomConfig,
      show_emptyChat: formData.features.show_emptyChat,
      hideChatCopyrightSetting: formData.features.hideChatCopyrightSetting,
      systemTitle: formData.features.systemTitle,
      docUrl: formData.features.docUrl,
      openAPIDocUrl: formData.features.openAPIDocUrl,
      submitPluginRequestUrl: formData.features.submitPluginRequestUrl,
      appTemplateCourse: formData.features.appTemplateCourse,
      concatMd: formData.features.concatMd,
      payFormUrl: formData.features.payFormUrl,
      limit: {
        exportDatasetLimitMinutes: formData.features.exportDatasetLimitMinutes,
        websiteSyncLimitMinuted: formData.features.websiteSyncLimitMinuted
      }
    };

    const existingFastgpt = await MongoSystemConfigs.findOne({
      type: SystemConfigsTypeEnum.fastgpt
    }).sort({ createTime: -1 });

    if (existingFastgpt) {
      existingFastgpt.value = { ...existingFastgpt.value, feConfigs };
      existingFastgpt.createTime = new Date();
      await existingFastgpt.save();
    } else {
      await MongoSystemConfigs.create({
        type: SystemConfigsTypeEnum.fastgpt,
        value: { feConfigs },
        createTime: new Date()
      });
    }

    // 3. 同时更新 config.json 文件（方案 B：确保没有 PRO_URL 也能生效）
    try {
      await updateConfigJsonFile(feConfigs, formData.license);
      addLog.info('config.json updated successfully');
    } catch (fileError) {
      addLog.warn('Failed to update config.json, but database config saved', fileError as Error);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    addLog.error('Update system config error:', error);
    return res.status(500).json({ success: false, error: '服务器错误，请稍后重试' });
  }
}

async function handler(req: ApiRequestProps, res: ApiResponseType) {
  if (req.method === 'GET') {
    return getHandler(req, res);
  }
  if (req.method === 'PUT') {
    return putHandler(req, res);
  }
  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}

export default NextAPI(handler);
