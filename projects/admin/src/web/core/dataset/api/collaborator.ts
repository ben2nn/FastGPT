/**
 * Admin 项目不需要协作者管理功能（权限由 admin 角色统一控制）
 * 提供 stub 实现以兼容从 App 项目移植的组件
 */

import type {
  UpdateDatasetCollaboratorBody,
  DatasetCollaboratorDeleteParams
} from '@fastgpt/global/core/dataset/collaborator';
import type { CollaboratorListType } from '@fastgpt/global/support/permission/collaborator';

export const getCollaboratorList = (_datasetId: string): Promise<CollaboratorListType> =>
  Promise.resolve({ clbs: [] });

export const postUpdateDatasetCollaborators = (
  _body: UpdateDatasetCollaboratorBody
): Promise<any> => Promise.resolve();

export const deleteDatasetCollaborators = (
  _params: DatasetCollaboratorDeleteParams
): Promise<any> => Promise.resolve();
