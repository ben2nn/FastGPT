import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { handleTeamApi } from '@/service/proApi/team';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  try {
    await connectToDatabase();
    const path = Array.isArray(req.query.path) ? req.query.path : [String(req.query.path || '')];

    return handleTeamApi({
      path: path.filter(Boolean),
      req,
      res
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}

export default NextAPI(handler);
