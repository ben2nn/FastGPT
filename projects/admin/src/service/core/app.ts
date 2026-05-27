import { type AppSchema } from '@fastgpt/global/core/app/type';
import { MongoApp } from '@fastgpt/service/core/app/schema';

/**
 * 本地版本的 findAppAndAllChildren，避免从 @fastgpt/service/core/app/controller 导入
 * 从而防止触发 evaluation/mq.ts 模块级的 Redis 连接
 */
export async function findAppAndAllChildren({
  teamId,
  appId,
  fields
}: {
  teamId: string;
  appId: string;
  fields?: string;
}): Promise<AppSchema[]> {
  const find = async (id: string) => {
    const children = await MongoApp.find(
      {
        teamId,
        parentId: id
      },
      fields
    ).lean();

    let apps = children;

    for (const child of children) {
      const grandChildrenIds = await find(child._id);
      apps = apps.concat(grandChildrenIds);
    }

    return apps;
  };
  const [app, childDatasets] = await Promise.all([MongoApp.findById(appId, fields), find(appId)]);

  if (!app) {
    return Promise.reject('App not found');
  }

  return [app, ...childDatasets];
}
