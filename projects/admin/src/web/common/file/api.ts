import { getWebReqUrl } from '@/web/common/utils';
import type { CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';

/**
 * 获取认证 token
 */

/**
 * 创建带认证头的 fetch 请求
 */
function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };
  return fetch(url, { ...options, headers, credentials: 'include' });
}

export const getUploadAvatarPresignedUrl = (params: {
  filename: string;
  autoExpired?: boolean;
}): Promise<CreatePostPresignedUrlResult> => {
  return authFetch(getWebReqUrl('/api/extend/common/file/presignAvatarPostUrl'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
    .then((res) => {
      if (!res.ok) throw new Error('获取上传地址失败');
      return res.json();
    })
    .then((json) => json.data);
};

export const getUploadDatasetFilePresignedUrl = (params: {
  filename: string;
  datasetId: string;
}): Promise<CreatePostPresignedUrlResult> => {
  return authFetch(getWebReqUrl('/api/core/dataset/presignDatasetFilePostUrl'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
    .then((res) => {
      if (!res.ok) throw new Error('获取上传地址失败');
      return res.json();
    })
    .then((json) => json.data);
};
