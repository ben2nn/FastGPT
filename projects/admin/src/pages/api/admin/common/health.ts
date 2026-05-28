import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

type HealthResponse = {
  status: string;
  timestamp: string;
};

async function handler(req: ApiRequestProps, res: ApiResponseType<HealthResponse>) {
  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
}

export default NextAPI(handler);
