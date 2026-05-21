import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { authJWT } from '@fastgpt/service/support/permission/controller';

const IMPORT_LIMIT = 1000;

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

    // 4. 解析请求体
    const { file } = req.body;

    if (!file) {
      return res.status(400).json({ success: false, error: 'File is required' });
    }

    // 5. 解析 JSON 文件
    let importData;
    try {
      importData = typeof file === 'string' ? JSON.parse(file) : file;
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid JSON format' });
    }

    // 6. 验证 JSON 结构
    if (importData.version !== '1.0' || importData.type !== 'models') {
      return res.status(400).json({ success: false, error: 'Invalid import file format' });
    }

    const { models } = importData;

    // 7. 验证数组字段
    if (!Array.isArray(models)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid import file structure: missing models array'
      });
    }

    // 8. 检查数据量
    if (models.length > IMPORT_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `导入数据量超过限制：${models.length} 条，最大允许 ${IMPORT_LIMIT} 条`
      });
    }

    // 9. 批量写入（upsert 模式）
    let insertedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    for (const modelDoc of models) {
      try {
        if (!modelDoc.model || !modelDoc.metadata) {
          failedCount++;
          continue;
        }

        const result = await MongoSystemModel.updateOne(
          { model: modelDoc.model },
          { $set: { metadata: modelDoc.metadata } },
          { upsert: true }
        );

        if (result.upsertedCount > 0) {
          insertedCount++;
        } else if (result.modifiedCount > 0) {
          updatedCount++;
        }
      } catch {
        failedCount++;
      }
    }

    // 10. 返回导入结果
    res.status(200).json({
      success: true,
      data: {
        insertedCount,
        updatedCount,
        failedCount
      }
    });
  } catch (error) {
    console.error('Import models error:', error);
    res.status(500).json({ success: false, error: 'Import failed' });
  }
}

export default NextAPI(handler);
