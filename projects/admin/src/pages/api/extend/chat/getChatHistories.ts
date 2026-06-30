import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { NextAPI } from '@/service/middleware/entry';

import { addLog } from '@fastgpt/service/common/system/log';

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
  res: ApiResponseType
): Promise<getChatHistoriesResponse> {
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
      matchFilter.time = {
        $gte: startTime,
        $lte: endTime
      };
    }

    // 添加关键字搜索（使用正则表达式）
    if (keyword?.trim()) {
      matchFilter.$or = [{ title: { $regex: keyword, $options: 'i' } }];
    }

    // 添加关键字搜索（使用正则表达式）
    if (source?.trim()) {
      // sourceName 字段不存在，忽略此过滤条件
    }
    return matchFilter;
  })();

  addLog.debug('[getChatHistories] match filter', { match });

  if (!match) {
    return {
      list: [],
      total: 0
    };
  }

  // 并行查询
  const [data, total] = await Promise.all([
    await MongoChat.find(match, 'chatId title appId updateTime source')
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
      sourceName: '',
      title: item.title
    })),
    total
  };
}

export default NextAPI(handler);
