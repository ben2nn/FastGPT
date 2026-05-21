/**
 * API 请求工具
 * 封装 axios 请求，提供统一的错误处理和请求拦截
 */

import type {
  Method,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosProgressEvent
} from 'axios';
import axios from 'axios';

interface ConfigType {
  headers?: { [key: string]: string };
  timeout?: number;
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
  cancelToken?: AbortController;
  withCredentials?: boolean;
}

interface ResponseDataType {
  code?: number;
  message?: string;
  data?: any;
}

/**
 * 请求开始拦截器
 */
function startInterceptors(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  // 可以在这里添加通用的请求头，如 token
  return config;
}

/**
 * 请求成功拦截器
 */
function responseSuccess(response: AxiosResponse<ResponseDataType>) {
  return response;
}

/**
 * 响应数据检查
 */
function checkRes(data: ResponseDataType) {
  if (data === undefined) {
    console.error('响应数据为空');
    return Promise.reject('服务器异常');
  }

  // 如果响应包含 code 字段，检查状态码
  if (data.code !== undefined && (data.code < 200 || data.code >= 400)) {
    return Promise.reject(data);
  }

  // 返回 data 字段，如果没有则返回整个响应
  return data.data !== undefined ? data.data : data;
}

/**
 * 响应错误处理
 */
function responseError(err: any) {
  console.error('请求错误:', err);

  const data = err?.response?.data || err;

  if (!err) {
    return Promise.reject({ message: '未知错误' });
  }

  if (typeof err === 'string') {
    return Promise.reject({ message: err });
  }

  if (typeof data === 'string') {
    return Promise.reject({ message: data });
  }

  // 处理认证错误
  if (err?.response?.status === 401) {
    // 可以在这里处理登录跳转
    return Promise.reject({ message: '身份验证失败，请先登录', code: 'UNAUTHORIZED' });
  }

  return Promise.reject(data);
}

/* 创建请求实例 */
const instance = axios.create({
  timeout: 60000, // 超时时间 60 秒
  headers: {
    'content-type': 'application/json'
  }
});

/**
 * 获取完整的 API URL（包含 basePath）
 */
const getFullApiUrl = (url: string) => {
  const basePath = process.env.NEXT_PUBLIC_BASE_URL || '';
  const apiBase = '/api';

  if (!basePath) {
    return `${apiBase}${url}`;
  }

  // 确保 basePath 不以 / 结尾
  const cleanBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  // 确保 url 以 / 开头
  const cleanUrl = url.startsWith('/') ? url : `/${url}`;

  return `${cleanBasePath}${apiBase}${cleanUrl}`;
};

/* 请求拦截 */
instance.interceptors.request.use(startInterceptors, (err) => Promise.reject(err));

/* 响应拦截 */
instance.interceptors.response.use(responseSuccess, (err) => Promise.reject(err));

/**
 * 通用请求函数
 */
function request(
  url: string,
  data: any,
  { cancelToken, withCredentials, ...config }: ConfigType,
  method: Method
): any {
  /* 去除 undefined 值 */
  for (const key in data) {
    if (data[key] === undefined) {
      delete data[key];
    }
  }

  return instance
    .request({
      url: getFullApiUrl(url),
      method,
      data: ['POST', 'PUT'].includes(method) ? data : undefined,
      params: !['POST', 'PUT'].includes(method) ? data : undefined,
      signal: cancelToken?.signal,
      withCredentials,
      ...config
    })
    .then((res) => checkRes(res.data))
    .catch((err) => responseError(err));
}

/**
 * GET 请求
 */
export function GET<T = undefined>(url: string, params = {}, config: ConfigType = {}): Promise<T> {
  return request(url, params, config, 'GET');
}

/**
 * POST 请求
 */
export function POST<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'POST');
}

/**
 * PUT 请求
 */
export function PUT<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'PUT');
}

/**
 * DELETE 请求
 */
export function DELETE<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'DELETE');
}
