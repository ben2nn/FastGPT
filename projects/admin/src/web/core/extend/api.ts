import { getWebReqUrl } from '@/web/common/utils';
import type { User } from '@/types/user';

// API 函数
export const fetchUsers = async () => {
  const response = await fetch(getWebReqUrl('/api/extend/user'));
  if (!response.ok) throw new Error('获取用户失败');
  return response.json();
};

export const addUser = async (userData: User) => {
  const response = await fetch(getWebReqUrl('/api/extend/user'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });
  if (!response.ok) throw new Error('添加用户失败');
  return response.json();
};

export const updateUser = async (userId: string, userData: User) => {
  const response = await fetch(getWebReqUrl(`/api/extend/user/${userId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });
  if (!response.ok) throw new Error('更新用户失败');
  return response.json();
};

export const deleteUser = async (userId: string) => {
  const response = await fetch(getWebReqUrl(`/api/extend/user/${userId}`), { method: 'DELETE' });
  if (!response.ok) throw new Error('删除用户失败');
  return response.json();
};

export const fetchTeams = async () => {
  const response = await fetch(getWebReqUrl('/api/extend/team'));
  if (!response.ok) throw new Error('获取团队失败');
  return response.json();
};

export const addTeam = async (teamData: { name: string; ownerId: string }) => {
  const response = await fetch(getWebReqUrl('/api/extend/team'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(teamData)
  });
  if (!response.ok) throw new Error('添加团队失败');
  return response.json();
};

export const updateTeam = async (teamId: string, teamData: { name: string }) => {
  const response = await fetch(getWebReqUrl(`/api/extend/team/${teamId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(teamData)
  });
  if (!response.ok) throw new Error('更新团队失败');
  return response.json();
};

export const deleteTeam = async (teamId: string) => {
  const response = await fetch(getWebReqUrl(`/api/extend/team/${teamId}`), { method: 'DELETE' });
  if (!response.ok) throw new Error('删除团队失败');
  return response.json();
};

export const fetchTeamMembers = async (teamId: string) => {
  const response = await fetch(getWebReqUrl(`/api/extend/team/${teamId}/members`));
  if (!response.ok) throw new Error('获取团队成员失败');
  return response.json();
};

export const addTeamMember = async (teamId: string, userId: string) => {
  const response = await fetch(getWebReqUrl(`/api/extend/team/${teamId}/members`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  if (!response.ok) throw new Error('添加成员失败');
  return response.json();
};

export const removeTeamMember = async (teamId: string, userId: string) => {
  const response = await fetch(getWebReqUrl(`/api/extend/team/${teamId}/members`), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  if (!response.ok) throw new Error('移除成员失败');
  return response.json();
};

// ==================== 导入导出 API ====================

// 知识库导出
export const exportDataset = async (parentId: string) => {
  const response = await fetch(getWebReqUrl('/api/extend/dataset/exportByParentId'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId })
  });
  if (!response.ok) throw new Error('知识库导出失败');
  return response.json();
};

// 知识库导入
export const importDataset = async (
  file: string | object,
  keepOriginalId: boolean,
  targetParentId?: string
) => {
  const response = await fetch(getWebReqUrl('/api/extend/dataset/importFromJson'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, keepOriginalId, targetParentId })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '知识库导入失败');
  }
  return response.json();
};

// 工作流导出
export const exportApp = async (parentId: string) => {
  const response = await fetch(getWebReqUrl('/api/extend/app/exportByParentId'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId })
  });
  if (!response.ok) throw new Error('工作流导出失败');
  return response.json();
};

// 工作流导入
export const importApp = async (file: string | object, targetParentId?: string) => {
  const response = await fetch(getWebReqUrl('/api/extend/app/importFromJson'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, targetParentId })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '工作流导入失败');
  }
  return response.json();
};

// 模型配置导出
export const exportModels = async (provider?: string, modelType?: string) => {
  const response = await fetch(getWebReqUrl('/api/extend/model/exportModels'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, modelType })
  });
  if (!response.ok) throw new Error('模型配置导出失败');
  return response.json();
};

// 模型配置导入
export const importModels = async (file: string | object) => {
  const response = await fetch(getWebReqUrl('/api/extend/model/importModels'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '模型配置导入失败');
  }
  return response.json();
};

// 渠道导出
export const exportChannels = async () => {
  const response = await fetch(getWebReqUrl('/api/extend/channel/exportChannels'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!response.ok) throw new Error('渠道导出失败');
  return response.json();
};

// 渠道导入
export const importChannels = async (file: string | object) => {
  const response = await fetch(getWebReqUrl('/api/extend/channel/importChannels'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '渠道导入失败');
  }
  return response.json();
};
