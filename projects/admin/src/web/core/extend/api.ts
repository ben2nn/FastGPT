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
