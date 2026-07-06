/**
 * 文件上传 API（立即执行增强模式）
 * 在请求内完成：读取 → 分块 → LLM/VLM 增强 → 推入 chunk 队列
 */
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { type FileIdCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { adminCreateCollectionAndInsertData } from '@/service/core/dataset/collection/adminCreateCollection';

async function handler(
  req: ApiRequestProps<FileIdCreateDatasetCollectionParams & { taskId?: string }>
) {
  const { fileId, customPdfParse, taskId, ...body } = req.body;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal,
    datasetId: body.datasetId
  });

  if (!isS3ObjectKey(fileId, 'dataset')) {
    return Promise.reject('Invalid dataset file key');
  }

  const metadata = await getS3DatasetSource().getFileMetadata(fileId);
  if (!metadata) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  const { collectionId, insertResults } = await adminCreateCollectionAndInsertData({
    dataset,
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.file,
      name: metadata.filename,
      fileId,
      customPdfParse
    },
    enhanceInline: true,
    taskId
  });

  return { collectionId, results: insertResults };
}

export default NextAPI(handler);
