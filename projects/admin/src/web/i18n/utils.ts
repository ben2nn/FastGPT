/**
 * i18n mock 工具函数
 * 用于满足 @fastgpt/global 包的依赖
 * admin 项目不需要实际的国际化功能，直接返回 key
 */

export const i18nT = (key: string): string => {
  return key;
};
