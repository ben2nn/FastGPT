import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authAdmin } from '@/service/support/permission/auth';
import {
  AppTypeEnum,
  AppFolderTypeList,
  AppTypeList,
  ToolTypeList
} from '@fastgpt/global/core/app/constants';

export type ListAppsBody = {
  parentId?: string | null;
  type?: 'workflow' | 'tool';
};

export type ListAppsResponse = {
  list: {
    _id: string;
    name: string;
    type: AppTypeEnum;
    avatar: string;
  }[];
};

// 工作流相关类型：应用类型 + 应用文件夹
const WorkflowTypes = [...AppTypeList, AppTypeEnum.folder];
// 工具相关类型：工具类型 + 工具文件夹 + 历史遗留类型
const ToolTypes = [
  ...ToolTypeList,
  AppTypeEnum.toolFolder,
  AppTypeEnum.httpPlugin,
  AppTypeEnum.tool
];

async function handler(
  req: ApiRequestProps<ListAppsBody>,
  res: ApiResponseType
): Promise<ListAppsResponse | void> {
  if (req.method !== 'POST') {
    res.status(405).json({ list: [] });
    return;
  }

  const authResult = await authAdmin(req);
  const teamId = authResult.teamId;
  if (!teamId) {
    res.status(401).json({ list: [] });
    return;
  }

  const { parentId, type } = req.body;

  const query: Record<string, any> = {
    teamId,
    deleteTime: null,
    parentId: parentId || null
  };

  if (type === 'workflow') {
    query.type = { $in: WorkflowTypes };
  } else if (type === 'tool') {
    query.type = { $in: ToolTypes };
  }

  const apps = await MongoApp.find(query, '_id name type avatar').sort({ updateTime: -1 }).lean();

  return {
    list: apps.map((app) => ({
      _id: String(app._id),
      name: app.name,
      type: app.type,
      avatar: app.avatar || '/icon/logo.svg'
    }))
  };
}

export default NextAPI(handler);
