import { initSystemConfig } from '.';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';

export const startMongoWatch = async () => {
  reloadConfigWatch();
};

const reloadConfigWatch = () => {
  const changeStream = MongoSystemConfigs.watch();

  changeStream.on('change', async (change) => {
    try {
      if (change.operationType === 'insert') {
        await initSystemConfig();
        console.log('refresh system config');
      }
    } catch (error) {}
  });
};
