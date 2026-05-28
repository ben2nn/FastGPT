import { getWebReqUrl } from '@/web/common/utils';
import type { CommercialFeatureForm } from '@/types/systemConfig';

/**
 * 获取认证 token
 */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('admin_token');
}

/**
 * 创建带认证头的 fetch 请求
 */
function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  if (token) {
    headers['token'] = token;
  }

  return fetch(url, {
    ...options,
    headers
  });
}

/**
 * 获取系统配置
 */
export const getSystemConfig = async (): Promise<CommercialFeatureForm> => {
  const response = await authFetch(getWebReqUrl('/api/system-config'));
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '获取系统配置失败');
  }
  const result = await response.json();
  return result.data;
};

/**
 * 更新系统配置
 */
export const updateSystemConfig = async (config: CommercialFeatureForm): Promise<void> => {
  const response = await authFetch(getWebReqUrl('/api/system-config'), {
    method: 'PUT',
    body: JSON.stringify(config)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '更新系统配置失败');
  }
};
