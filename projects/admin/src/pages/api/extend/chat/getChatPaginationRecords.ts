import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import format from 'date-fns/format';

export type getChatHistoriesBody = {
  appId: string;
  chatIdList?: string[];
  keyword?: string;
  source?: string;
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

  const { appId, chatIdList, keyword, source, startTime, endTime } = req.body;

  const { offset, pageSize } = parsePaginationRequest(req);

  if (!appId) {
    return {};
  }

  const match = await (async () => {
    // 初始化基础过滤条件
    const matchFilter: Record<string, any> = {
      appId: appId
    };

    if (chatIdList) {
      matchFilter.chatId = { $in: chatIdList };
    }

    // 添加时间范围过滤
    if (startTime && endTime) {
      matchFilter.updateTime = {
        $gte: startTime,
        $lte: endTime
      };
    }

    if (source?.trim()) {
      // sourceName 字段不存在，忽略此过滤条件
    }
    return matchFilter;
  })();

  if (!match) {
    return {
      list: [],
      total: 0
    };
  }

  const app = await MongoApp.findOne({ _id: appId }, '_id name').lean();

  const chat = await MongoChat.find(match, 'chatId').lean();
  const chatMaps = chat.reduce((acc, item) => {
    acc.set(item.chatId, '');
    return acc;
  }, new Map<string, any>());

  const _match = await (async () => {
    // 初始化基础过滤条件
    const matchFilter: Record<string, any> = {
      appId: appId
    };

    if (chat) {
      matchFilter.chatId = { $in: chat.map((item) => item.chatId) };
    }

    // 添加时间范围过滤
    if (startTime && endTime) {
      matchFilter.time = {
        $gte: startTime,
        $lte: endTime
      };
    }

    // 添加关键字搜索（使用正则表达式）
    if (keyword?.trim()) {
      matchFilter.$and = [{ 'value.text.content': { $regex: keyword, $options: 'i' } }];
    }

    return matchFilter;
  })();

  _match.obj = 'Human';
  const [data, total] = await Promise.all([
    await MongoChatItem.find(_match, 'appId chatId obj value time')
      .sort({ _id: 1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoChatItem.countDocuments(_match)
  ]);

  _match.obj = 'AI';
  const items = await MongoChatItem.find(_match, 'appId chatId obj value time')
    .sort({ _id: 1 })
    .skip(offset)
    .limit(pageSize)
    .lean();

  /* eslint-disable */
  const maps = items.reduce((acc, item) => {
    const key = item.chatId + '_' + format(item.time, 'yyyyMMddHHmmss');
    acc.set(key, {
      content:
        item.value?.length > 1
          ? item.value?.filter((v) => v.type !== ChatItemValueTypeEnum.tool)[1]?.text?.content
          : item.value?.filter((v) => v.type !== ChatItemValueTypeEnum.tool)[0]?.text?.content
    });
    return acc;
  }, new Map<string, any>());

  // 结果转换
  return {
    list: data.map((item) => ({
      _id: item._id,
      chatId: item.chatId,
      time: item.time,
      appId: item.appId,
      appName: app?.name,
      sourceName: chatMaps.get(item.chatId),
      title: item.value.filter((v) => v.type !== ChatItemValueTypeEnum.tool)[0]?.text?.content,
      value: maps.get(item.chatId + '_' + format(item.time, 'yyyyMMddHHmmss'))?.content
    })),
    total
  };
}

export default NextAPI(handler);
