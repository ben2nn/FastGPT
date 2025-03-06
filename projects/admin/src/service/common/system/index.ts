import { initHttpAgent } from '@fastgpt/service/common/middle/httpAgent';
import fs, { existsSync } from 'fs';
import type { FastGPTConfigFileType } from '@fastgpt/global/common/system/types/index.d';
import { getFastGPTConfigFromDB } from '@fastgpt/service/common/system/config/controller';
import { isProduction } from '@fastgpt/global/common/system/constants';
import { initFastGPTConfig } from '@fastgpt/service/common/system/tools';
import json5 from 'json5';
import { defaultGroup, defaultTemplateTypes } from '@fastgpt/web/core/workflow/constants';
import { MongoPluginGroups } from '@fastgpt/service/core/app/plugin/pluginGroupSchema';
import { MongoTemplateTypes } from '@fastgpt/service/core/app/templates/templateTypeSchema';
import { loadSystemModels } from '@fastgpt/service/core/ai/config/utils';

export const readConfigData = async (name: string) => {
  const splitName = name.split('.');
  const devName = `${splitName[0]}.local.${splitName[1]}`;

  const filename = (() => {
    if (!isProduction) {
      // check local file exists
      const hasLocalFile = existsSync(`data/${devName}`);
      if (hasLocalFile) {
        return `data/${devName}`;
      }
      return `data/${name}`;
    }
    // production path
    return `/admin/data/${name}`;
  })();

  const content = await fs.promises.readFile(filename, 'utf-8');

  return content;
};

/* Init global variables */
export function initGlobalVariables() {
  initHttpAgent();
}

/* Init system data(Need to connected db). It only needs to run once */
export async function getInitConfig() {
  return Promise.all([initSystemConfig(), loadSystemModels()]);
}

export async function initSystemConfig() {
  // load config
  const [{ config: dbConfig }] = await Promise.all([getFastGPTConfigFromDB()]);
  const fileRes = json5.parse(fileConfig) as FastGPTConfigFileType;

  // get config from database
  const config: FastGPTConfigFileType = {
    feConfigs: {},
    systemEnv: {
      ...fileRes.systemEnv,
      ...(dbConfig.systemEnv || {})
    }
  };

  // set config
  initFastGPTConfig(config);

  console.log({
    systemEnv: global.systemEnv
  });
}

export async function initSystemPluginGroups() {
  try {
    const { groupOrder, ...restDefaultGroup } = defaultGroup;
    await MongoPluginGroups.updateOne(
      {
        groupId: defaultGroup.groupId
      },
      {
        $set: restDefaultGroup
      },
      {
        upsert: true
      }
    );
  } catch (error) {
    console.error('Error initializing system plugins:', error);
  }
}

export async function initAppTemplateTypes() {
  try {
    await Promise.all(
      defaultTemplateTypes.map((templateType) => {
        const { typeOrder, ...rest } = templateType;

        return MongoTemplateTypes.updateOne(
          {
            typeId: templateType.typeId
          },
          {
            $set: rest
          },
          {
            upsert: true
          }
        );
      })
    );
  } catch (error) {
    console.error('Error initializing system templates:', error);
  }
}
