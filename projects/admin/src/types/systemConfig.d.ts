/**
 * 系统配置类型定义
 * 对应主应用的 systemConfigs 集合
 */

// License 数据类型 - 决定 isPlus 和部分功能
export type LicenseDataType = {
  startTime: string;
  expiredTime: string;
  company: string;
  description?: string;
  hosts?: string[];
  maxUsers?: number;
  maxApps?: number;
  maxDatasets?: number;
  functions: {
    sso: boolean;
    pay: boolean;
    customTemplates: boolean;
    datasetEnhance: boolean;
    batchEval: boolean;
  };
};

// FastGPT 前端配置类型
export type FastGPTFeConfigsType = {
  show_workorder?: boolean;
  show_emptyChat?: boolean;
  isPlus?: boolean;
  hideChatCopyrightSetting?: boolean;
  register_method?: ('email' | 'phone' | 'sync')[];
  login_method?: ('email' | 'phone')[];
  find_password_method?: ('email' | 'phone')[];
  bind_notification_method?: ('email' | 'phone')[];

  show_appStore?: boolean;
  show_git?: boolean;
  show_pay?: boolean;
  show_openai_account?: boolean;
  show_promotion?: boolean;
  show_team_chat?: boolean;
  show_compliance_copywriting?: boolean;
  show_aiproxy?: boolean;
  show_coupon?: boolean;
  show_discount_coupon?: boolean;
  showWecomConfig?: boolean;

  show_dataset_feishu?: boolean;
  show_dataset_yuque?: boolean;
  show_publish_feishu?: boolean;
  show_publish_dingtalk?: boolean;
  show_publish_wecom?: boolean;
  show_publish_offiaccount?: boolean;

  show_dataset_enhance?: boolean;
  show_batch_eval?: boolean;

  concatMd?: string;
  docUrl?: string;
  openAPIDocUrl?: string;
  submitPluginRequestUrl?: string;
  appTemplateCourse?: string;
  customApiDomain?: string;
  customSharePageDomain?: string;

  systemTitle?: string;
  favicon?: string;

  limit?: {
    exportDatasetLimitMinutes?: number;
    websiteSyncLimitMinuted?: number;
  };

  payConfig?: {
    wx?: boolean;
    alipay?: boolean;
    bank?: boolean;
  };
  payFormUrl?: string;
};

// systemConfigs 集合文档类型
export type SystemConfigDoc = {
  _id: string;
  type: 'fastgpt' | 'fastgptPro' | 'systemMsgModal' | 'license' | 'operationalAd' | 'activityAd';
  value: {
    feConfigs?: FastGPTFeConfigsType;
    data?: LicenseDataType;
    [key: string]: any;
  };
  createTime: string;
};

// 商业版功能配置表单数据
export type CommercialFeatureForm = {
  // License 配置
  license: {
    enabled: boolean;
    company: string;
    description: string;
    expiredTime: string;
    maxUsers: number;
    maxApps: number;
    maxDatasets: number;
    functions: {
      sso: boolean;
      pay: boolean;
      customTemplates: boolean;
      datasetEnhance: boolean;
      batchEval: boolean;
    };
  };
  // 功能开关配置
  features: {
    // 发布渠道
    show_publish_feishu: boolean;
    show_publish_dingtalk: boolean;
    show_publish_wecom: boolean;
    show_publish_offiaccount: boolean;
    // 数据集
    show_dataset_feishu: boolean;
    show_dataset_yuque: boolean;
    show_dataset_enhance: boolean;
    // 其他功能
    show_batch_eval: boolean;
    show_pay: boolean;
    show_promotion: boolean;
    show_team_chat: boolean;
    show_appStore: boolean;
    show_aiproxy: boolean;
    show_coupon: boolean;
    show_discount_coupon: boolean;
    show_git: boolean;
    show_openai_account: boolean;
    show_compliance_copywriting: boolean;
    showWecomConfig: boolean;
    // 界面配置
    show_emptyChat: boolean;
    hideChatCopyrightSetting: boolean;
    // 文案配置
    systemTitle: string;
    docUrl: string;
    openAPIDocUrl: string;
    submitPluginRequestUrl: string;
    appTemplateCourse: string;
    concatMd: string;
    payFormUrl: string;
    // 限制配置
    exportDatasetLimitMinutes: number;
    websiteSyncLimitMinuted: number;
  };
};
