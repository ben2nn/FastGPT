/**
 * 获取 Web 请求 URL
 * @param url 相对路径
 * @returns 完整的 URL
 *
 * 注意：
 * - 用于 fetch/axios 等 API 请求，需要手动添加 basePath
 * - router.push() 会自动处理 basePath，不需要使用此函数
 */
export const getWebReqUrl = (url: string = '') => {
  if (!url) return '/';

  // 优先使用环境变量，如果没有则尝试从 window 获取（客户端）
  let baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  // 在客户端，如果环境变量未定义，尝试从 window.__NEXT_DATA__ 获取
  if (typeof window !== 'undefined' && !baseUrl) {
    try {
      // Next.js 会将 basePath 注入到 __NEXT_DATA__ 中
      baseUrl = (window as any).__NEXT_DATA__?.basePath || '';
    } catch (e) {
      baseUrl = '';
    }
  }

  if (!baseUrl) {
    return url;
  }

  // 确保 baseUrl 不以 / 结尾
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  // 确保 url 以 / 开头
  const cleanUrl = url.startsWith('/') ? url : `/${url}`;

  return `${cleanBaseUrl}${cleanUrl}`;
};
