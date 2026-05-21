/**
 * 数据提取服务
 * 负责从 MongoDB 提取大模型调用记录并转换为目标格式
 */

import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import type { ModelCallLog, DataCapStats } from '@/types/datacap';
import { SystemError, ErrorType } from '@/service/common/errors';
import { addLog } from '@fastgpt/service/common/system/log';

/**
 * 数据提取服务类
 * 实现 IDataExtractionService 接口
 */
export class DataCapCollect {
  private stats: DataCapStats = {
    totalRecords: 0,
    successRecords: 0,
    failedRecords: 0,
    executionTime: 0
  };

  /**
   * 提取指定时间范围的调用记录
   * @param startDate 开始时间
   * @param endDate 结束时间
   * @param batchSize 批次大小（可选，默认从环境变量读取或使用 1000）
   * @returns 提取的记录数组
   */
  async extractCallLogs(
    startDate: Date,
    endDate: Date,
    batchSize?: number
  ): Promise<ModelCallLog[]> {
    const startTime = Date.now();
    // 优先使用传入的参数，其次从环境变量读取，最后使用默认值 1000
    const effectiveBatchSize =
      batchSize ?? parseInt(process.env.EXTRACTION_BATCH_SIZE || '1000', 10);

    addLog.info('开始提取数据', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      batchSize: effectiveBatchSize
    });

    try {
      // 重置统计信息
      this.stats = {
        totalRecords: 0,
        successRecords: 0,
        failedRecords: 0,
        executionTime: 0
      };

      const allLogs: ModelCallLog[] = [];
      let skip = 0;
      let hasMore = true;

      // 分批处理数据
      while (hasMore) {
        const batchNumber = Math.floor(skip / effectiveBatchSize) + 1;
        addLog.debug(`正在处理第 ${batchNumber} 批数据`, {
          skip,
          batchSize: effectiveBatchSize
        });

        const batchLogs = await this.extractBatch(startDate, endDate, skip, effectiveBatchSize);

        if (batchLogs.length === 0) {
          hasMore = false;
        } else {
          allLogs.push(...batchLogs);
          skip += effectiveBatchSize;

          // 如果返回的记录数少于批次大小，说明已经是最后一批
          if (batchLogs.length < effectiveBatchSize) {
            hasMore = false;
          }
        }
      }

      this.stats.totalRecords = allLogs.length;
      this.stats.successRecords = allLogs.length;
      this.stats.executionTime = Date.now() - startTime;

      addLog.info('数据提取完成', {
        totalRecords: allLogs.length,
        executionTime: this.stats.executionTime,
        recordsPerSecond: Math.round((allLogs.length / this.stats.executionTime) * 1000)
      });

      return allLogs;
    } catch (error) {
      this.stats.executionTime = Date.now() - startTime;
      this.stats.failedRecords = this.stats.totalRecords - this.stats.successRecords;

      addLog.error(
        `数据提取失败 - 统计: ${JSON.stringify(this.stats)}`,
        error instanceof Error ? error : new Error(String(error))
      );

      throw new SystemError(
        ErrorType.DATA_CAP_ERROR,
        `数据提取失败: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 提取一批数据
   * @param startDate 开始时间
   * @param endDate 结束时间
   * @param skip 跳过的记录数
   * @param limit 限制返回的记录数
   * @returns 提取的记录数组
   */
  private async extractBatch(
    startDate: Date,
    endDate: Date,
    skip: number,
    limit: number
  ): Promise<ModelCallLog[]> {
    try {
      addLog.debug('查询条件', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        skip,
        limit
      });

      // 先检查是否有符合条件的数据
      const humanCount = await MongoChatItem.countDocuments({
        obj: 'Human',
        time: { $gte: startDate, $lte: endDate }
      });
      addLog.debug('Human 消息数量', { humanCount });

      const aiCount = await MongoChatItem.countDocuments({
        obj: 'AI',
        time: { $gte: startDate, $lte: endDate }
      });
      addLog.debug('AI 消息数量', { aiCount });

      // 检查样本数据结构
      const sampleHuman = await MongoChatItem.findOne({
        obj: 'Human',
        time: { $gte: startDate, $lte: endDate }
      }).lean();

      if (sampleHuman) {
        addLog.debug('Human 消息样本', {
          dataId: (sampleHuman as any).dataId,
          appId: (sampleHuman as any).appId,
          chatId: (sampleHuman as any).chatId,
          time: (sampleHuman as any).time
        });
      }

      const sampleAI = await MongoChatItem.findOne({
        obj: 'AI',
        time: { $gte: startDate, $lte: endDate }
      }).lean();

      if (sampleAI) {
        addLog.debug('AI 消息样本', {
          dataId: (sampleAI as any).dataId,
          appId: (sampleAI as any).appId,
          chatId: (sampleAI as any).chatId,
          time: (sampleAI as any).time,
          hasResponseData: !!(sampleAI as any).responseData,
          responseDataLength: Array.isArray((sampleAI as any).responseData)
            ? (sampleAI as any).responseData.length
            : 0
        });
      }

      // 使用 MongoDB 聚合管道提取数据
      // 注意：根据数据结构，Human 和 AI 消息通过 chatId 和时间顺序关联
      // 每个 Human 消息后面紧跟一个 AI 消息（如果调用成功）
      const pipeline = [
        // 1. 筛选 AI 消息和时间范围（直接从 AI 消息开始，因为 AI 消息包含 responseData）
        {
          $match: {
            obj: 'AI',
            time: { $gte: startDate, $lte: endDate }
          }
        },
        // 2. 关联应用信息（包含 modules 字段用于提取 model）
        {
          $lookup: {
            from: 'apps',
            localField: 'appId',
            foreignField: '_id',
            as: 'appInfo'
          }
        },
        // 3. 关联会话信息
        {
          $lookup: {
            from: 'chat',
            localField: 'chatId',
            foreignField: 'chatId',
            as: 'chatInfo'
          }
        },
        // 4. 展开数组
        {
          $unwind: { path: '$appInfo', preserveNullAndEmptyArrays: true }
        },
        {
          $unwind: { path: '$chatInfo', preserveNullAndEmptyArrays: true }
        },
        // 5. 展开 responseData 数组
        {
          $unwind: { path: '$responseData', preserveNullAndEmptyArrays: true }
        },
        // 6. 只保留 chat 类别且包含模型信息的记录
        // chat 类别的 moduleType: chatNode, classifyQuestion, contentExtract, tools, queryExtension
        {
          $match: {
            //'responseData.model': { $exists: true, $ne: null },
            'responseData.moduleType': {
              $in: [
                'chatNode',
                'classifyQuestion',
                'contentExtract',
                'tools',
                'cfr' // queryExtension 的实际值是 'cfr'
              ]
            }
          }
        },
        // 7. 投影所需字段
        {
          $project: {
            // 使用 responseData.id 作为唯一的 callId
            callId: '$responseData.id',
            appId: { $toString: '$appId' },
            appName: '$appInfo.name',
            // 当 model 为空时，从 appInfo.modules 中根据 nodeId 提取
            // 1. 先尝试使用 responseData.model
            // 2. 如果为空，从 modules 数组中找到匹配 nodeId 的 module
            // 3. 从该 module 的 inputs 数组中找到 key 为 'model' 的项
            // 4. 提取其 value 值
            modelId: {
              $cond: {
                // 使用 $ifNull 处理字段不存在的情况
                // 如果 model 存在且不为空字符串，使用它；否则从 modules 提取
                if: {
                  $and: [
                    { $ne: [{ $ifNull: ['$responseData.model', null] }, null] },
                    { $ne: [{ $ifNull: ['$responseData.model', ''] }, ''] }
                  ]
                },
                then: '$responseData.model',
                else: {
                  // 从 modules 中提取 model
                  // inputs 是一个数组，每个元素是 { key: string, value: any }
                  $let: {
                    vars: {
                      // 找到匹配 nodeId 的 module
                      matchedModule: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: { $ifNull: ['$appInfo.modules', []] },
                              as: 'module',
                              cond: { $eq: ['$$module.nodeId', '$responseData.nodeId'] }
                            }
                          },
                          0
                        ]
                      }
                    },
                    in: {
                      // 从 inputs 数组中找到 key='model' 的元素
                      $let: {
                        vars: {
                          modelInput: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: { $ifNull: ['$$matchedModule.inputs', []] },
                                  as: 'input',
                                  cond: { $eq: ['$$input.key', 'model'] }
                                }
                              },
                              0
                            ]
                          }
                        },
                        in: { $ifNull: ['$$modelInput.value', 'unknown'] }
                      }
                    }
                  }
                }
              }
            },
            modelName: {
              $cond: {
                // 使用 $ifNull 处理字段不存在的情况
                // 如果 model 存在且不为空字符串，使用它；否则从 modules 提取
                if: {
                  $and: [
                    { $ne: [{ $ifNull: ['$responseData.model', null] }, null] },
                    { $ne: [{ $ifNull: ['$responseData.model', ''] }, ''] }
                  ]
                },
                then: '$responseData.model',
                else: {
                  // 从 modules 中提取 model（与 modelId 相同逻辑）
                  // inputs 是一个数组，每个元素是 { key: string, value: any }
                  $let: {
                    vars: {
                      matchedModule: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: { $ifNull: ['$appInfo.modules', []] },
                              as: 'module',
                              cond: { $eq: ['$$module.nodeId', '$responseData.nodeId'] }
                            }
                          },
                          0
                        ]
                      }
                    },
                    in: {
                      // 从 inputs 数组中找到 key='model' 的元素
                      $let: {
                        vars: {
                          modelInput: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: { $ifNull: ['$$matchedModule.inputs', []] },
                                  as: 'input',
                                  cond: { $eq: ['$$input.key', 'model'] }
                                }
                              },
                              0
                            ]
                          }
                        },
                        in: { $ifNull: ['$$modelInput.value', 'unknown'] }
                      }
                    }
                  }
                }
              }
            },
            callTimestamp: '$time',
            // 调用状态：根据模型类别和输出判断
            // 标准状态：成功、超时、错误
            // 判断逻辑：
            // 1. 索引模型（embedding）：queryExtensionResult 有值 -> 成功，否则 -> 错误
            // 2. 语言模型（chat）：outputTokens > 0 -> 成功，否则 -> 错误
            callStatus: {
              $cond: {
                // 优先检查是否有错误信息（errorText）
                // 使用 $gt 检查字符串长度，只有当 errorText 存在且长度 > 0 时才判定为 error
                if: {
                  $gt: [{ $strLenCP: { $ifNull: ['$responseData.errorText', ''] } }, 0]
                },
                then: 'error',
                // 没有错误信息，根据 moduleType 和 token 消耗判断
                else: {
                  $switch: {
                    branches: [
                      // 索引模型（embedding）：根据 queryExtensionResult 或 token 消耗判断
                      // queryExtensionResult 可能是对象（有值）或 null/undefined（无值）
                      // 只要有 queryExtensionResult 或有 token 消耗，就算成功
                      /* {
                                                case: { $eq: ['$responseData.moduleType', 'datasetSearchNode'] },
                                                then: {
                                                    $cond: {
                                                        if: {
                                                            $or: [
                                                                // 方法1：queryExtensionResult 存在且不为 null
                                                                {
                                                                    $and: [
                                                                        { $ne: ['$responseData.queryExtensionResult', null] },
                                                                        { $ne: ['$responseData.queryExtensionResult', undefined] }
                                                                    ]
                                                                },
                                                                // 方法2：有 token 消耗
                                                                {
                                                                    $gt: [
                                                                        {
                                                                            $add: [
                                                                                { $ifNull: ['$responseData.inputTokens', 0] },
                                                                                { $ifNull: ['$responseData.outputTokens', 0] }
                                                                            ]
                                                                        },
                                                                        0
                                                                    ]
                                                                }
                                                            ]
                                                        },
                                                        then: 'success',
                                                        else: 'error'
                                                    }
                                                }
                                            }, */
                      // 语言模型：根据 token 消耗判断
                      // 只要有 token 消耗就算成功（包括 inputTokens 或 outputTokens）
                      {
                        case: {
                          $or: [
                            { $eq: ['$responseData.moduleType', 'chatNode'] },
                            { $eq: ['$responseData.moduleType', 'classifyQuestion'] }
                          ]
                        },
                        then: {
                          $cond: {
                            if: {
                              $gt: [
                                {
                                  $add: [
                                    { $ifNull: ['$responseData.inputTokens', 0] },
                                    { $ifNull: ['$responseData.outputTokens', 0] }
                                  ]
                                },
                                0
                              ]
                            },
                            then: 'success',
                            else: 'error'
                          }
                        }
                      },
                      {
                        case: { $eq: ['$responseData.moduleType', 'tools'] },
                        then: {
                          $cond: {
                            if: {
                              $or: [
                                // 方法：有 token 消耗
                                {
                                  $gt: [
                                    {
                                      $add: [
                                        { $ifNull: ['$responseData.toolCallInputTokens', 0] },
                                        { $ifNull: ['$responseData.toolCallOutputTokens', 0] }
                                      ]
                                    },
                                    0
                                  ]
                                }
                              ]
                            },
                            then: 'success',
                            else: 'error'
                          }
                        }
                      }
                    ],
                    // 默认：根据 totalTokens 判断（兼容未知节点类型）
                    // 只要有 token 消耗就算成功
                    default: {
                      $cond: {
                        if: {
                          $gt: [
                            {
                              $add: [
                                { $ifNull: ['$responseData.inputTokens', 0] },
                                { $ifNull: ['$responseData.outputTokens', 0] }
                              ]
                            },
                            0
                          ]
                        },
                        then: 'success',
                        else: 'error'
                      }
                    }
                  }
                }
              }
            },
            // 保留原始字段用于后续分析
            errorInfo: '$responseData.error',
            errorText: '$responseData.errorText',
            outputTokensRaw: '$responseData.outputTokens',
            queryExtensionResultRaw: '$responseData.queryExtensionResult',
            chatId: { $toString: '$chatId' },
            dataId: { $toString: '$dataId' },
            // 根据 moduleType 选择正确的 token 字段
            inputTokens: {
              $cond: {
                if: { $eq: ['$responseData.moduleType', 'tools'] },
                then: { $ifNull: ['$responseData.toolCallInputTokens', 0] },
                else: { $ifNull: ['$responseData.inputTokens', 0] }
              }
            },
            outputTokens: {
              $cond: {
                if: { $eq: ['$responseData.moduleType', 'tools'] },
                then: { $ifNull: ['$responseData.toolCallOutputTokens', 0] },
                else: { $ifNull: ['$responseData.outputTokens', 0] }
              }
            },
            totalTokens: {
              $cond: {
                if: { $eq: ['$responseData.moduleType', 'tools'] },
                then: {
                  $add: [
                    { $ifNull: ['$responseData.toolCallInputTokens', 0] },
                    { $ifNull: ['$responseData.toolCallOutputTokens', 0] }
                  ]
                },
                else: {
                  $add: [
                    { $ifNull: ['$responseData.inputTokens', 0] },
                    { $ifNull: ['$responseData.outputTokens', 0] }
                  ]
                }
              }
            },
            totalPoints: { $ifNull: ['$responseData.totalPoints', 0] },
            source: '$chatInfo.source',
            sourceName: '$chatInfo.sourceName',
            // 新增字段：节点类型（使用场景）
            moduleType: '$responseData.moduleType',
            // 新增字段：模型类别（根据节点类型判断）
            // 只有 datasetSearchNode 是 embedding，其他都是 chat
            modelCategory: {
              $cond: {
                if: { $eq: ['$responseData.moduleType', 'datasetSearchNode'] },
                then: 'embedding',
                else: 'chat'
              }
            },
            // 新增字段：运行时间（秒）
            runningTime: { $ifNull: ['$responseData.runningTime', null] },
            // 调试字段：用于排查 model 提取问题
            _debug: {
              responseDataNodeId: '$responseData.nodeId',
              responseDataModel: '$responseData.model',
              responseDataModelType: { $type: '$responseData.model' },
              hasAppInfo: { $ne: ['$appInfo', null] },
              appModulesCount: { $size: { $ifNull: ['$appInfo.modules', []] } },
              // 显示匹配的 module 信息
              matchedModuleInfo: {
                $let: {
                  vars: {
                    matchedModule: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: { $ifNull: ['$appInfo.modules', []] },
                            as: 'module',
                            cond: { $eq: ['$$module.nodeId', '$responseData.nodeId'] }
                          }
                        },
                        0
                      ]
                    }
                  },
                  in: {
                    hasMatch: { $ne: ['$$matchedModule', null] },
                    nodeId: '$$matchedModule.nodeId',
                    inputsCount: { $size: { $ifNull: ['$$matchedModule.inputs', []] } },
                    // inputs 是数组，显示所有 input 的 key
                    inputKeys: {
                      $map: {
                        input: { $ifNull: ['$$matchedModule.inputs', []] },
                        as: 'inp',
                        in: '$$inp.key'
                      }
                    },
                    // 显示提取的 model 值
                    extractedModelValue: {
                      $let: {
                        vars: {
                          modelInput: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: { $ifNull: ['$$matchedModule.inputs', []] },
                                  as: 'input',
                                  cond: { $eq: ['$$input.key', 'model'] }
                                }
                              },
                              0
                            ]
                          }
                        },
                        in: '$$modelInput.value'
                      }
                    },
                    // 显示完整的 model input 对象
                    modelInputObject: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: { $ifNull: ['$$matchedModule.inputs', []] },
                            as: 'input',
                            cond: { $eq: ['$$input.key', 'model'] }
                          }
                        },
                        0
                      ]
                    }
                  }
                }
              }
            }
          }
        },
        // 8. 分页
        { $skip: skip },
        { $limit: limit }
      ];

      // 执行聚合查询
      addLog.debug('执行聚合查询', { skip, limit });
      const results = await MongoChatItem.aggregate(pipeline).exec();

      addLog.debug('聚合查询结果', {
        count: results.length,
        sample: results.length > 0 ? results[0] : null
      });

      // 统计 model 提取情况并记录详细信息
      const modelStats = {
        total: results.length,
        fromResponseData: 0,
        fromModules: 0,
        unknown: 0,
        unknownSamples: [] as any[]
      };

      results.forEach((doc: any) => {
        if (doc.modelId === 'unknown') {
          modelStats.unknown++;
          // 记录前 3 个 unknown 的样本用于调试
          if (modelStats.unknownSamples.length < 3) {
            modelStats.unknownSamples.push({
              callId: doc.callId,
              appId: doc.appId,
              appName: doc.appName,
              moduleType: doc.moduleType
              // 注意：这里无法获取原始的 nodeId，因为已经在投影阶段
            });
          }
        } else if (doc.modelId) {
          modelStats.fromResponseData++;
        }
      });

      addLog.debug('Model 提取统计', {
        total: modelStats.total,
        fromResponseData: modelStats.fromResponseData,
        unknown: modelStats.unknown,
        unknownSamples: modelStats.unknownSamples
      });

      // 转换结果为 ModelCallLog 格式
      const logs: ModelCallLog[] = results.map((doc: any) => this.transformDocument(doc));

      return logs;
    } catch (error) {
      addLog.error(
        `批次数据提取失败 - skip: ${skip}, limit: ${limit}`,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * 转换 MongoDB 文档为 ModelCallLog 格式
   * @param doc MongoDB 文档
   * @returns ModelCallLog 对象
   */
  private transformDocument(doc: any): ModelCallLog {
    // 调试：记录 model 为 unknown 的情况
    if (doc.modelId === 'unknown' && doc._debug) {
      const debugInfo: any = {
        callId: doc.callId,
        appId: doc.appId,
        appName: doc.appName,
        moduleType: doc.moduleType,
        responseDataNodeId: doc._debug.responseDataNodeId,
        responseDataModel: doc._debug.responseDataModel,
        responseDataModelType: doc._debug.responseDataModelType,
        hasAppInfo: doc._debug.hasAppInfo,
        appModulesCount: doc._debug.appModulesCount
      };

      if (doc._debug.matchedModuleInfo) {
        debugInfo.matchedModule = {
          hasMatch: doc._debug.matchedModuleInfo.hasMatch,
          nodeId: doc._debug.matchedModuleInfo.nodeId,
          inputsCount: doc._debug.matchedModuleInfo.inputsCount,
          inputKeys: doc._debug.matchedModuleInfo.inputKeys,
          extractedModelValue: doc._debug.matchedModuleInfo.extractedModelValue,
          modelInputObject: doc._debug.matchedModuleInfo.modelInputObject
        };
      }

      addLog.warn('⚠️ Model 提取为 unknown', debugInfo);
    }
    // 调用状态已在聚合管道中判断，这里进一步细化超时错误
    let callStatus = String(doc.callStatus || 'success');
    const runningTime = doc.runningTime ? Number(doc.runningTime) : undefined;

    let isTimeout = false;

    // 方法2：根据运行时间判断（运行时间特别长且无返回）
    // 语言模型：运行时间 > 30 秒且无输出 -> 超时
    // 索引模型：运行时间 > 30 秒且无查询结果 -> 超时
    if (!isTimeout && runningTime && runningTime > 30) {
      const hasOutput = doc.outputTokensRaw && doc.outputTokensRaw > 0;
      const hasQueryResult = doc.queryExtensionResultRaw;

      if (!hasOutput && !hasQueryResult) {
        isTimeout = true;
      }
    }

    if (isTimeout) {
      callStatus = 'timeout';
    }

    return {
      callId: String(doc.callId || ''),
      appId: String(doc.appId || ''),
      appName: String(doc.appName || ''),
      // 当 model 为空时使用 'unknown'
      modelId: String(doc.modelId || 'unknown'),
      modelName: String(doc.modelName || 'unknown'),
      callTimestamp:
        doc.callTimestamp instanceof Date ? doc.callTimestamp : new Date(doc.callTimestamp),
      callStatus,
      chatId: String(doc.chatId || ''),
      dataId: doc.dataId ? String(doc.dataId) : undefined,
      inputTokens: Number(doc.inputTokens || 0),
      outputTokens: Number(doc.outputTokens || 0),
      // 计算 totalTokens = inputTokens + outputTokens
      totalTokens: Number(doc.totalTokens || 0),
      totalPoints: Number(doc.totalPoints || 0),
      source: doc.source ? String(doc.source) : undefined,
      sourceName: doc.sourceName ? String(doc.sourceName) : undefined,
      // 新增字段：模型类别
      modelCategory: String(doc.modelCategory || 'chat'),
      // 新增字段：使用场景（节点类型）
      usageScenario: String(doc.moduleType || ''),
      // 新增字段：运行时间（秒）
      runningTime,
      // 新增字段：错误信息文本
      errorText: doc.errorText ? String(doc.errorText) : undefined
    };
  }

  /**
   * 获取提取统计信息
   * @returns 统计数据
   */
  async getDataCapStats(): Promise<DataCapStats> {
    return { ...this.stats };
  }

  /**
   * 获取指定时间范围内的记录总数（用于进度估算）
   * @param startDate 开始时间
   * @param endDate 结束时间
   * @returns 记录总数
   */
  async getRecordCount(startDate: Date, endDate: Date): Promise<number> {
    try {
      const count = await MongoChatItem.countDocuments({
        obj: 'AI',
        time: { $gte: startDate, $lte: endDate },
        responseData: { $exists: true, $ne: [] }
      });

      return count;
    } catch (error) {
      addLog.error('获取记录数失败', error instanceof Error ? error : new Error(String(error)));
      return 0;
    }
  }
}

/**
 * 导出单例实例
 */
export const dataCapCollect = new DataCapCollect();
