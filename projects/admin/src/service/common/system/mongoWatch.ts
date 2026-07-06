import { getInitConfig } from '.';
import { createAdminTrainingMongoWatch } from '@/service/core/dataset/training/utils';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { addLog } from '@fastgpt/service/common/system/log';
import { connectionMongo, MONGO_URL } from '@fastgpt/service/common/mongo';
import { connectMongo } from '@fastgpt/service/common/mongo/init';
import {
  waitForMongoReady,
  setExternalReconnecting,
  setOnKeepAliveReconnect
} from '@/service/common/mongo';

let changeStreams: any[] = [];
let isReconnecting = false;

/**
 * 启动 MongoDB Change Streams 监听
 * 监听系统配置变更，保持连接活跃
 */
export const startMongoWatch = async () => {
  cleanupMongoWatch();
  addLog.info('启动 MongoDB Change Streams 监听');

  // 注册保活重连回调：保活成功重连后重建 Change Streams
  setOnKeepAliveReconnect(() => {
    addLog.info('保活重连触发 Change Streams 重建');
    cleanupMongoWatch();
    setupChangeStreams();
  });

  // 监听连接断开事件，自动重连
  setupConnectionMonitor();

  // 建立 Change Streams
  await setupChangeStreams();
};

/**
 * 建立 Change Streams
 * 必须在连接真正就绪后调用，否则游标初始化会抛出 MongoNotConnectedError
 */
const setupChangeStreams = async () => {
  try {
    // 再次确认连接就绪（防御性检查）
    const ready = await waitForMongoReady(5000);
    if (!ready) {
      addLog.error('Change Streams 建立失败：连接未就绪');
      return;
    }

    const configStream = reloadConfigWatch();
    const trainingStream = createAdminTrainingMongoWatch();

    // 捕获 Change Stream 游标级别的错误，防止 uncaughtException 崩溃进程
    configStream.on('error', (err) => {
      addLog.error('Change Stream (config) 错误', err);
      handleChangeStreamError();
    });
    trainingStream.on('error', (err) => {
      addLog.error('Change Stream (training) 错误', err);
      handleChangeStreamError();
    });

    changeStreams.push(configStream);
    changeStreams.push(trainingStream);
    addLog.info('Change Streams 建立成功');
  } catch (error) {
    addLog.error('Change Streams 建立失败', error as Error);
  }
};

/**
 * 设置连接监控
 * 监听连接断开事件，自动触发重连
 */
const setupConnectionMonitor = () => {
  connectionMongo.connection.on('disconnected', () => {
    addLog.warn('MongoDB 连接断开，启动自动重连');
    handleReconnect();
  });

  connectionMongo.connection.on('connected', () => {
    addLog.info('MongoDB 连接已建立');
  });

  connectionMongo.connection.on('error', (error) => {
    addLog.error('MongoDB 连接错误', error);
  });

  addLog.info('MongoDB 连接监控已启用');
};

/**
 * 处理重连逻辑
 * 使用指数退避策略，避免频繁重连
 */
const handleReconnect = async () => {
  if (isReconnecting) {
    addLog.debug('重连正在进行中，跳过');
    return;
  }

  isReconnecting = true;
  setExternalReconnecting(true); // 通知保活跳过重连
  let retryCount = 0;
  const maxRetries = 5;
  const baseDelay = 1000; // 1 秒

  while (retryCount < maxRetries) {
    const retryDelay = baseDelay * Math.pow(2, retryCount); // 指数退避
    addLog.info(`等待 ${retryDelay}ms 后尝试重连 (${retryCount + 1}/${maxRetries})`);

    await new Promise((resolve) => setTimeout(resolve, retryDelay));

    // 检查是否已经重连成功
    if (connectionMongo.connection.readyState === 1) {
      addLog.info('MongoDB 已重新连接');
      isReconnecting = false;
      setExternalReconnecting(false);
      return;
    }

    try {
      addLog.info(`尝试重连 MongoDB (${retryCount + 1}/${maxRetries})`);
      await connectMongo({ db: connectionMongo, url: MONGO_URL });

      // connectMongo 在 readyState !== 0 时直接返回，需等待 driver 级连接真正就绪
      const ready = await waitForMongoReady(10000);
      if (!ready) {
        addLog.warn(`MongoDB 重连后连接未就绪 (${retryCount + 1}/${maxRetries})`);
        retryCount++;
        continue;
      }

      addLog.info('MongoDB 重连成功');

      // 重新建立 Change Streams
      cleanupMongoWatch();
      await setupChangeStreams();

      isReconnecting = false;
      setExternalReconnecting(false);
      return;
    } catch (error) {
      addLog.error(`MongoDB 重连失败 (${retryCount + 1}/${maxRetries})`, error as Error);
      retryCount++;
    }
  }

  addLog.error(`MongoDB 重连失败，已达到最大重试次数 (${maxRetries})`);
  isReconnecting = false;
  setExternalReconnecting(false);
};

/**
 * Change Stream 发生错误时的统一处理
 * 清理旧 streams 并触发重连
 */
const handleChangeStreamError = () => {
  addLog.warn('Change Stream 错误，将在 2 秒后尝试重建');
  setTimeout(() => {
    cleanupMongoWatch();
    handleReconnect();
  }, 2000);
};

/**
 * 监听系统配置变更
 * 当系统配置更新时，自动重新加载配置
 */
const reloadConfigWatch = () => {
  const changeStream = MongoSystemConfigs.watch();

  return changeStream.on('change', async (change) => {
    try {
      if (change.operationType === 'update' || change.operationType === 'insert') {
        await getInitConfig();
        addLog.info('系统配置已更新并重新加载', {
          type: change.operationType,
          collection: 'system_configs'
        });
      }
    } catch (error) {
      addLog.error('监听系统配置变更失败:', error as Error);
    }
  });
};

/**
 * 清理所有 Change Streams
 */
const cleanupMongoWatch = () => {
  changeStreams.forEach((changeStream) => {
    try {
      changeStream?.close();
    } catch (error) {
      addLog.error('关闭 Change Stream 失败', error as Error);
    }
  });
  changeStreams = [];
};
