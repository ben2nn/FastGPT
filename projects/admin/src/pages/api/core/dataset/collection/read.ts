import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';

export type readCollectionSourceQuery = {};

export type readCollectionSourceBody = {
  collectionId: string;
};

export type readCollectionSourceResponse = {
  type: 'url';
  value: string;
};

async function handler(
  req: ApiRequestProps<readCollectionSourceBody, readCollectionSourceQuery>
): Promise<readCollectionSourceResponse> {
  const { collectionId } = req.body;

  const { collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ReadPermissionVal
  });

  const sourceUrl = await (async () => {
    if (
      collection.type === DatasetCollectionTypeEnum.file &&
      collection.fileId &&
      isS3ObjectKey(collection.fileId, 'dataset')
    ) {
      return (
        await getS3DatasetSource().createGetDatasetFileURL({
          key: collection.fileId,
          expiredHours: 1,
          external: true
        })
      ).url;
    }
    if (collection.type === DatasetCollectionTypeEnum.link && collection.rawLink) {
      return collection.rawLink;
    }
    if (collection.type === DatasetCollectionTypeEnum.apiFile && collection.apiFileId) {
      return (await getApiDatasetRequest(collection.dataset.apiDatasetServer)).getFilePreviewUrl({
        apiFileId: collection.apiFileId
      });
    }
    if (collection.type === DatasetCollectionTypeEnum.externalFile) {
      if (collection.externalFileId && collection.dataset.externalReadUrl) {
        return collection.dataset.externalReadUrl.replace('{{fileId}}', collection.externalFileId);
      }
      if (collection.externalFileUrl) {
        return collection.externalFileUrl;
      }
    }

    return '';
  })();

  return {
    type: 'url',
    value: sourceUrl
  };
}

export default NextAPI(handler);
