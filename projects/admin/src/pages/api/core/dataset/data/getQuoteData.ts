import { NextAPI } from '@/service/middleware/entry';
import { type DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { formatDatasetDataValue } from '@fastgpt/service/core/dataset/data/controller';

export type GetQuoteDataResponse = {
  collection: DatasetCollectionSchemaType;
  q: string;
  a?: string;
};

export type GetQuoteDataProps = {
  id: string;
};

async function handler(req: ApiRequestProps<GetQuoteDataProps>): Promise<GetQuoteDataResponse> {
  const { id: dataId } = req.body;

  const { datasetData, collection } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: ReadPermissionVal
  });

  return {
    collection,
    ...formatDatasetDataValue({
      q: datasetData.q,
      a: datasetData.a,
      imageId: datasetData.imageId
    })
  };
}

export default NextAPI(handler);
