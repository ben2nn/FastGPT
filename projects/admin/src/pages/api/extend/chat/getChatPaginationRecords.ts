import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';
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
  res: ApiResponseType<any>
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
    filter.time = {
      $gte: startTime,
      $lte: endTime
    };
  }

  // 关键字搜索（同时匹配问题和回答）
  if (keyword) {
    const regex = new RegExp(keyword, 'i');
    filter.value = { $regex: regex };
  }

  if (!filter) {
    return {
      list: [],
      total: 0
    };
  }

  filter.obj = 'Human';
  const [data, total] = await Promise.all([
    await MongoChatItem.find(filter, 'appId chatId obj value time')
      .sort({ top: -1, updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoChatItem.countDocuments(filter)
  ]);

  filter.obj = 'AI';
  const items = await MongoChatItem.find(filter, 'appId chatId obj value time')
    .sort({ top: -1, updateTime: -1 })
    .skip(offset)
    .limit(pageSize)
    .lean();

  const maps = items.reduce((acc, item) => {
    acc.set(item.chatId, {
      content: item.value[1]?.text?.content,
      reasoning_content: item.value[0]?.reasoning?.content
    });
    return acc;
  }, new Map<string, any>());

  // 结果转换
  return {
    list: data.map((item) => ({
      chatId: item.chatId,
      time: item.time,
      appId: item.appId,
      title: item.value[0]?.text?.content,
      value: maps.get(item.chatId)
    })),
    total
  };
}

export default NextAPI(handler);
