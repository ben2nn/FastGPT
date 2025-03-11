import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/mongo';

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
  res: ApiResponseType
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

  const match = await (async () => {
    // 初始化基础过滤条件
    const matchFilter: Record<string, any> = {
      appId: appId,
      chatId: { $in: chatIdList }
    };

    // 添加时间范围过滤
    if (startTime && endTime) {
      matchFilter.time = {
        $gte: startTime,
        $lte: endTime
      };
    }

    // 添加关键字搜索（使用正则表达式）
    if (keyword?.trim()) {
      matchFilter.$or = [{ 'value[0].text.content': { $regex: keyword, $options: 'i' } }];
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
    await MongoChat.find(match, 'chatId title appId updateTime')
      .sort({ top: -1, updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoChat.countDocuments(match)
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
