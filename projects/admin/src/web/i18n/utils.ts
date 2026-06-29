/**
 * Admin i18n 服务端工具函数
 * serviceSideProps 在每个 NextJS 项目中需要独立实现，因为依赖 next-i18next 的配置
 * 其他工具（i18nT, setLangToStorage 等）直接使用 @fastgpt/web/i18n/utils
 */

import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { I18nNsType } from '@fastgpt/web/i18n/i18next';

export const serviceSideProps = async (context: any, ns: I18nNsType = []) => {
  const lang = context.req?.cookies?.NEXT_LOCALE || context.locale;
  const extraLng = context.req?.cookies?.NEXT_LOCALE ? undefined : context.locales;
  const deviceSize = context.req?.cookies?.NEXT_DEVICE_SIZE || null;

  return {
    ...(await serverSideTranslations(lang, ['common', ...ns], undefined, extraLng)),
    deviceSize
  };
};

// i18nT 以及客户端语言管理工具请直接从 @fastgpt/web/i18n/utils 导入
// 例如: import { i18nT, setLangToStorage, getLangFromStorage } from '@fastgpt/web/i18n/utils';
