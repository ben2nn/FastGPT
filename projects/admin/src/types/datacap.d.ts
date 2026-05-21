// ==================== 核心数据模型 ====================

/**
 * 模型调用日志记录
 */
export interface ModelCallLog {
  callId: string; // 调用ID (responseData.id)
  appId: string; // 智能体ID
  appName: string; // 智能体名称
  modelId: string; // 模型ID
  modelName: string; // 模型名称
  callTimestamp: Date; // 调用时间戳
  callStatus: string; // 调用状态（success/failed/stop等）
  chatId: string; // 会话ID
  dataId?: string; // 数据ID
  inputTokens: number; // 输入Token
  outputTokens: number; // 输出Token
  totalTokens: number; // 总Token（inputTokens + outputTokens）
  totalPoints: number; // 消耗积分
  source?: string; // 调用来源
  sourceName?: string; // 来源名称
  modelCategory: string; // 模型类别（chat/embedding）
  usageScenario: string; // 使用场景（classifyQuestion/chatNode/datasetSearchNode等）
  runningTime?: number; // 运行时间（秒）
  errorText?: string; // 错误信息文本
}

/**
 * PostgreSQL 数据库记录
 */
export interface ModelCallLogRecord extends ModelCallLog {
  id: number; // 主键
  createdAt: Date; // 记录创建时间
  updatedAt: Date; // 记录更新时间
}

// ==================== 服务接口 ====================

/**
 * 数据提取服务接口
 */
export interface DatacapCollect {
  /**
   * 提取指定时间范围的调用记录
   */
  datacapLogs(startDate: Date, endDate: Date): Promise<ModelCallLog[]>;

  /**
   * 获取提取统计信息
   */
  getDataCapStats(): Promise<DataCapStats>;
}

// ==================== 统计和结果类型 ====================

/**
 * 提取统计信息
 */
export interface DataCapStats {
  totalRecords: number;
  successRecords: number;
  failedRecords: number;
  executionTime: number;
}

/**
 * 插入结果
 */
export interface InsertResult {
  successCount: number;
  failedCount: number;
  duplicateCount: number;
  errors: Array<{ callId: string; error: string }>;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * 批量验证结果
 */
export interface BatchValidationResult {
  totalCount: number;
  validCount: number;
  invalidCount: number;
  invalidRecords: Array<{
    log: ModelCallLog;
    errors: string[];
  }>;
}
