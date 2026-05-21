import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { connectionMongo, MONGO_URL } from '@fastgpt/service/common/mongo';
import { addLog } from '@fastgpt/service/common/system/log';

/**
 * This function is equivalent to the entry to the service
 * connect MongoDB and init data
 */
export async function connectToDatabase() {
  try {
    await connectMongo({ db: connectionMongo, url: MONGO_URL });
    addLog.info('MongoDB 连接已建立');
  } catch (error) {
    console.error('MongoDB 连接错误:', error);
    throw error;
  }
}
