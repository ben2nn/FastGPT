import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { authJWT } from '@fastgpt/service/support/permission/controller';

const EXPORT_LIMIT = 10000;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. 连接数据库
    await connectToDatabase();

    // 2. 验证请求方法
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // 3. 验证 JWT Token
    const authHeader = req.headers.authorization;
    const token = req.headers.token as string | undefined;

    let jwtToken: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      jwtToken = authHeader.substring(7);
    } else if (token) {
      jwtToken = token;
    }

    if (!jwtToken) {
      return res.status(401).json({ success: false, error: 'Token 不存在' });
    }

    try {
      await authJWT(jwtToken);
    } catch (error) {
      return res.status(401).json({ success: false, error: 'Token 无效或已过期' });
    }

    // 4. 获取筛选参数
    const { provider, modelType } = req.body;

    // 5. 构建查询条件
    const query: Record<string, unknown> = {};
    if (provider) {
      query['metadata.provider'] = provider;
    }
    if (modelType) {
      query['metadata.type'] = modelType;
    }

    // 6. 查询模型配置
    const models = await MongoSystemModel.find(query).limit(EXPORT_LIMIT).lean();

    // 7. 组装导出数据
    const exportData = {
      version: '1.0',
      type: 'models',
      exportTime: new Date().toISOString(),
      filters: {
        provider: provider || null,
        modelType: modelType || null
      },
      models
    };

    // 8. 设置响应头并返回
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=model-export-${Date.now()}.json`);
    res.status(200).json(exportData);
  } catch (error) {
    console.error('Export models error:', error);
    res.status(500).json({ success: false, error: 'Export failed' });
  }
}

export default NextAPI(handler);
