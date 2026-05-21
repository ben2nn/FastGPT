// ==================== MongoDB 数据模型 ====================
/**
 * 数据提取系统的类型定义
 */
import { Types } from '@fastgpt/service/common/mongo';

// 为了方便使用，创建 ObjectId 类型别名
type ObjectId = Types.ObjectId;
/**
 * MongoDB apps 集合文档
 */
export interface App {
  _id: ObjectId;
  name: string;
  teamId: ObjectId;
  type: string;
}

/**
 * MongoDB chat 集合文档
 */
export interface Chat {
  chatId: string;
  appId: ObjectId;
  source: string;
  sourceName: string;
  updateTime: Date;
}

/**
 * MongoDB chatitems 集合文档
 */
export interface ChatItem {
  _id: ObjectId;
  teamId: ObjectId;
  tmbId: ObjectId;
  userId: ObjectId;
  chatId: string;
  dataId: string;
  appId: ObjectId;
  time: Date;
  obj: 'Human' | 'AI' | 'System';
  value: any[];
  nodeResponse?: NodeResponse[];
}

/**
 * 节点响应信息
 */
export interface NodeResponse {
  totalPoints: number;
  model: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  query: string;
  maxToken: number;
  finishReason: string;
  contextTotalLen: number;
}
