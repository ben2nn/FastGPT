import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';

export type getAppItemsBody = {
  appId?: string;
  name?: string;
};

export type getAppItemsResponse = ChatHistoryItemResType[] | {};

async function handler(
  req: ApiRequestProps<getAppItemsBody>,
  res: ApiResponseType
): Promise<getAppItemsResponse> {
  await connectToDatabase();

  const dceHappy = req.headers['dce-happy'];
  if (!dceHappy || dceHappy != process.env.DCE_HAPPY) {
    res.status(403).json({ code: 403, message: '访问受限' });
    return {};
  }

  const { appId, name } = req.body;

  const { offset, pageSize } = parsePaginationRequest(req);

  const match = await (async () => {
    // 初始化基础过滤条件
    const matchFilter: Record<string, any> = {};

    if (appId) {
      matchFilter._id = appId;
    }

    // 添加关键字搜索（使用正则表达式）
    if (name?.trim()) {
      matchFilter.$or = [{ name: { $regex: name, $options: 'i' } }];
    }
    return matchFilter;
  })();

  if (!match) {
    return {
      list: [],
      total: 0
    };
  }

  // 并行查询
  const [data, total] = await Promise.all([
    await MongoApp.find(match, '_id name')
      .sort({ top: -1, updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoApp.countDocuments(match)
  ]);

  // 结果转换
  return {
    list: data.map((item) => ({
      id: item._id,
      name: item.name
    })),
    total
  };
}

export default NextAPI(handler);
