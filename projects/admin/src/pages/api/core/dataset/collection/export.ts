import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { responseWriteController } from '@fastgpt/service/common/response';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { type NextApiResponse } from 'next';
import { sanitizeCsvField } from '@fastgpt/service/common/file/csv';
import { replaceS3KeyToPreviewUrl } from '@fastgpt/service/core/dataset/utils';
import { addDays } from 'date-fns';
import { ExportCollectionBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/api';

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const parseBody = ExportCollectionBodySchema.parse(req.body);
  const collectionId = parseBody.collectionId;

  const { collection, teamId: userTeamId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ReadPermissionVal
  });

  const where = {
    teamId: userTeamId,
    datasetId: collection.datasetId,
    collectionId
  };

  res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
  res.setHeader('Content-Disposition', 'attachment; filename=data.csv; ');

  const cursor = MongoDatasetData.find(where, 'q a', {
    ...readFromSecondary,
    batchSize: 1000
  })
    .sort({ chunkIndex: 1 })
    .limit(50000)
    .cursor();

  const write = responseWriteController({
    res,
    readStream: cursor
  });

  write(`\uFEFFq,a`);

  cursor.on('data', (doc) => {
    const sanitizedQ = replaceS3KeyToPreviewUrl(
      sanitizeCsvField(doc.q || ''),
      addDays(new Date(), 90)
    );
    const sanitizedA = replaceS3KeyToPreviewUrl(
      sanitizeCsvField(doc.a || ''),
      addDays(new Date(), 90)
    );

    write(`\n${sanitizedQ},${sanitizedA}`);
  });

  cursor.on('end', () => {
    cursor.close();
    res.end();
  });

  cursor.on('error', (err) => {
    addLog.error(`export usage error`, err);
    res.status(500);
    res.end();
  });
}

export default NextAPI(
  useIPFrequencyLimit({ id: 'export-usage', seconds: 60, limit: 1, force: true }),
  handler
);
