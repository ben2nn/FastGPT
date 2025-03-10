import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/mongo';
import { NextApiResponse } from 'next/dist/shared/lib/utils';
import { Filter } from 'jsondiffpatch';

export type getChatHistoriesBody = {
  appId: string;
  chatIdList: string[];
  keyword?: string;
  startTime?: Date;
  endTime?: Date;
};

export type getChatHistoriesResponse = ChatHistoryItemResType[] | {};

async function handler(
  req: ApiRequestProps<getChatHistoriesBody>,
  res: NextApiResponse
): Promise<getChatHistoriesResponse> {
  await connectToDatabase();

  const dceHappy = req.headers['dce-happy'];
  if (!dceHappy || dceHappy != process.env.DCE_HAPPY) {
    res.status(403).json({ code: 403, message: '访问受限' });
    return {};
  }

  const { appId, chatIdList, keyword, startTime, endTime } = req.body;

  const { offset, pageSize } = parsePaginationRequest(req);

  if (!appId || !chatIdList?.length) {
    return {};
  }

  // 构建查询条件
  const filter = {
    appId: appId,
    chatId: { $in: chatIdList }
  };

  // 时间范围过滤
  if (startTime && endTime) {
    filter.updateTime = {
      $gte: startTime,
      $lte: endTime
    };
  }

  // 关键字搜索（同时匹配问题和回答）
  if (keyword) {
    const regex = new RegExp(keyword, 'i');
    filter.title = { $regex: regex };
  }

  if (!filter) {
    return {
      list: [],
      total: 0
    };
  }

  // 并行查询
  const [data, total] = await Promise.all([
    await MongoChat.find(filter, 'chatId title appId updateTime')
      .sort({ top: -1, updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoChat.countDocuments(filter)
  ]);

  // 结果转换
  return {
    list: data.map((item) => ({
      chatId: item.chatId,
      updateTime: item.updateTime,
      appId: item.appId,
      title: item.title
    })),
    total
  };
}

export default NextAPI(handler);
