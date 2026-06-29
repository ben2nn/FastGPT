import type { InitDateResponse } from '@/pages/api/common/system/getInitData';
import { getWebReqUrl } from '@/web/common/utils';

export const getInitData = (bufferId?: string): Promise<InitDateResponse> => {
  const url = new URL(getWebReqUrl('/api/common/system/getInitData'), window.location.origin);
  if (bufferId) url.searchParams.set('bufferId', bufferId);

  return fetch(url.toString(), {
    credentials: 'include' // 通过 fastgpt_token cookie 认证（与 app 项目统一）
  })
    .then((res) => {
      if (!res.ok) throw new Error('获取初始化数据失败');
      return res.json();
    })
    .then((json) => {
      // NextEntry 中间件将响应封装为 { code, statusText, message, data } 结构
      // 需要解包 data 字段，与主应用 checkRes 逻辑一致
      if (json.code < 200 || json.code >= 400) {
        return Promise.reject(json);
      }
      return json.data ?? json;
    });
};

/**
 * 带重试的初始化数据获取
 */
export const getInitDataWithRetry = async (
  bufferId?: string,
  retry = 3
): Promise<InitDateResponse> => {
  try {
    return await getInitData(bufferId);
  } catch (error) {
    if (retry > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return getInitDataWithRetry(bufferId, retry - 1);
    }
    throw error;
  }
};
