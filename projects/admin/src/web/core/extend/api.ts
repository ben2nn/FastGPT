import { getWebReqUrl } from '@/web/common/utils';
import type { User } from '@/types/user';

/**
 * 获取认证 token
 */
export /**
 * 创建带认证头的 fetch 请求
 */
function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  return fetch(url, {
    ...options,
    headers
  });
}

// API 函数
export const fetchUsers = async () => {
  const response = await authFetch(getWebReqUrl('/api/extend/user'));
  if (!response.ok) throw new Error('获取用户失败');
  return response.json();
};

export const addUser = async (userData: User) => {
  const response = await authFetch(getWebReqUrl('/api/extend/user'), {
    method: 'POST',
    body: JSON.stringify(userData)
  });
  if (!response.ok) throw new Error('添加用户失败');
  return response.json();
};

export const updateUser = async (userId: string, userData: User) => {
  const response = await authFetch(getWebReqUrl(`/api/extend/user/${userId}`), {
    method: 'PUT',
    body: JSON.stringify(userData)
  });
  if (!response.ok) throw new Error('更新用户失败');
  return response.json();
};

export const deleteUser = async (userId: string) => {
  const response = await authFetch(getWebReqUrl(`/api/extend/user/${userId}`), {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('删除用户失败');
  return response.json();
};

export const fetchTeams = async () => {
  const response = await authFetch(getWebReqUrl('/api/extend/team'));
  if (!response.ok) throw new Error('获取团队失败');
  return response.json();
};

export const addTeam = async (teamData: { name: string; ownerId: string }) => {
  const response = await authFetch(getWebReqUrl('/api/extend/team'), {
    method: 'POST',
    body: JSON.stringify(teamData)
  });
  if (!response.ok) throw new Error('添加团队失败');
  return response.json();
};

export const updateTeam = async (teamId: string, teamData: { name: string }) => {
  const response = await authFetch(getWebReqUrl(`/api/extend/team/${teamId}`), {
    method: 'PUT',
    body: JSON.stringify(teamData)
  });
  if (!response.ok) throw new Error('更新团队失败');
  return response.json();
};

export const deleteTeam = async (teamId: string) => {
  const response = await authFetch(getWebReqUrl(`/api/extend/team/${teamId}`), {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('删除团队失败');
  return response.json();
};

export const fetchTeamMembers = async (teamId: string) => {
  const response = await authFetch(getWebReqUrl(`/api/extend/team/${teamId}/members`));
  if (!response.ok) throw new Error('获取团队成员失败');
  return response.json();
};

export const addTeamMember = async (teamId: string, userId: string) => {
  const response = await authFetch(getWebReqUrl(`/api/extend/team/${teamId}/members`), {
    method: 'POST',
    body: JSON.stringify({ userId })
  });
  if (!response.ok) throw new Error('添加成员失败');
  return response.json();
};

export const removeTeamMember = async (teamId: string, userId: string) => {
  const response = await authFetch(getWebReqUrl(`/api/extend/team/${teamId}/members`), {
    method: 'DELETE',
    body: JSON.stringify({ userId })
  });
  if (!response.ok) throw new Error('移除成员失败');
  return response.json();
};

// ==================== 导入导出 API ====================

// 知识库导出
export const exportDataset = async (
  id: string,
  options?: { type?: string; includeFiles?: boolean }
) => {
  const response = await authFetch(getWebReqUrl('/api/extend/dataset/exportByParentId'), {
    method: 'POST',
    body: JSON.stringify({
      id,
      type: options?.type,
      includeFiles: options?.includeFiles
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '知识库导出失败');
  }

  // 根据 Content-Type 判断返回类型
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/zip')) {
    return { blob: await response.blob(), isZip: true };
  }
  return { data: await response.json(), isZip: false };
};

// 知识库导入
export const importDataset = async (formData: FormData) => {
  const response = await fetch(getWebReqUrl('/api/extend/dataset/importFromJson'), {
    method: 'POST',
    body: formData
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '知识库导入失败');
  }
  return response.json();
};

// 工作流导出
export const exportApp = async (parentId: string) => {
  const response = await authFetch(getWebReqUrl('/api/extend/app/exportByParentId'), {
    method: 'POST',
    body: JSON.stringify({ parentId })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '工作流导出失败');
  }
  return response.json();
};

// 工作流导入
export const importApp = async (
  file: string | object,
  keepOriginalId: boolean,
  targetId?: string,
  targetType?: string
) => {
  const response = await authFetch(getWebReqUrl('/api/extend/app/importFromJson'), {
    method: 'POST',
    body: JSON.stringify({ file, keepOriginalId, targetId, targetType })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '工作流导入失败');
  }
  return response.json();
};

// 模型配置导出
export const exportModels = async (provider?: string, modelType?: string) => {
  const response = await authFetch(getWebReqUrl('/api/extend/model/exportModels'), {
    method: 'POST',
    body: JSON.stringify({ provider, modelType })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '模型配置导出失败');
  }
  return response.json();
};

// 模型配置导入
export const importModels = async (file: string | object, keepOriginalId?: boolean) => {
  const response = await authFetch(getWebReqUrl('/api/extend/model/importModels'), {
    method: 'POST',
    body: JSON.stringify({ file, keepOriginalId })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '模型配置导入失败');
  }
  return response.json();
};

// 渠道导出
export const exportChannels = async () => {
  const response = await authFetch(getWebReqUrl('/api/extend/channel/exportChannels'), {
    method: 'POST'
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '渠道导出失败');
  }
  return response.json();
};

// 渠道导入
export const importChannels = async (file: string | object, keepOriginalId?: boolean) => {
  const response = await authFetch(getWebReqUrl('/api/extend/channel/importChannels'), {
    method: 'POST',
    body: JSON.stringify({ file, keepOriginalId })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '渠道导入失败');
  }
  return response.json();
};

// 工具导出
export const exportTools = async (parentId?: string) => {
  const response = await authFetch(getWebReqUrl('/api/extend/tool/exportTools'), {
    method: 'POST',
    body: JSON.stringify({ parentId })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '工具导出失败');
  }
  return response.json();
};

// 工具导入
export const importTools = async (
  file: string | object,
  keepOriginalId: boolean,
  targetId?: string,
  targetType?: string
) => {
  const response = await authFetch(getWebReqUrl('/api/extend/tool/importTools'), {
    method: 'POST',
    body: JSON.stringify({ file, keepOriginalId, targetId, targetType })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '工具导入失败');
  }
  return response.json();
};

// ==================== 应用管理 API ====================

// 获取应用列表（按 parentId 获取，用于树形选择）
export const fetchApps = async (parentId?: string | null, type?: 'workflow' | 'tool') => {
  const response = await authFetch(getWebReqUrl('/api/extend/app/list'), {
    method: 'POST',
    body: JSON.stringify({ parentId: parentId || null, type })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '获取应用列表失败');
  }
  return response.json();
};

// ==================== 知识库管理 API ====================

// 获取知识库列表（所有团队）
export const fetchDatasets = async (params?: {
  parentId?: string | null;
  search?: string;
  teamId?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}) => {
  const response = await authFetch(getWebReqUrl('/api/core/dataset/list'), {
    method: 'POST',
    body: JSON.stringify({
      parentId: params?.parentId,
      type: params?.type,
      searchKey: params?.search
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '获取知识库列表失败');
  }
  return response.json();
};

// 删除知识库（软删除）
export const deleteDatasetById = async (datasetId: string) => {
  const response = await authFetch(getWebReqUrl(`/api/core/dataset/${datasetId}`), {
    method: 'DELETE'
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '删除知识库失败');
  }
  return response.json();
};

// 获取知识库详情
export const fetchDatasetDetail = async (datasetId: string) => {
  const response = await authFetch(getWebReqUrl(`/api/core/dataset/${datasetId}`));
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '获取知识库详情失败');
  }
  return response.json();
};
