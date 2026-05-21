import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authJWT } from '@fastgpt/service/support/permission/controller';

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

    let decoded;
    try {
      decoded = await authJWT(jwtToken);
    } catch (error) {
      return res.status(401).json({ success: false, error: 'Token 无效或已过期' });
    }

    // 从 JWT payload 中获取 teamId 和 tmbId
    const teamId = decoded?.team?.teamId;
    const tmbId = decoded?.team?.tmbId;
    if (!teamId || !tmbId) {
      return res.status(401).json({ success: false, error: '无法获取团队信息' });
    }

    // 4. 解析请求体
    const { file, targetParentId } = req.body;

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
    if (importData.version !== '1.0' || importData.type !== 'app') {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid import file format' });
    }

    const { apps, versions } = importData;

    // 验证数组字段
    if (!Array.isArray(apps) || !Array.isArray(versions)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid import file structure: missing required arrays'
      });
    }

    // 6.5. 检查导入数据量限制
    const IMPORT_LIMIT = 50000;
    const totalDocs = apps.length + versions.length;
    if (totalDocs > IMPORT_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `导入数据量超过限制：${totalDocs} 条，最大允许 ${IMPORT_LIMIT} 条`
      });
    }

    // 7. 更新文档
    const updatedApps = apps.map((doc: Record<string, unknown>) => {
      const updated = { ...doc };
      updated.teamId = teamId;
      updated.tmbId = tmbId;
      if (targetParentId) {
        updated.parentId = targetParentId;
      }
      return updated;
    });

    const updatedVersions = versions.map((doc: Record<string, unknown>) => {
      const updated = { ...doc };
      updated.teamId = teamId;
      updated.tmbId = tmbId;
      return updated;
    });

    // 8. 批量写入数据库
    const [appsResult, versionsResult] = await Promise.all([
      MongoApp.insertMany(updatedApps, { ordered: false }),
      MongoAppVersion.insertMany(updatedVersions, { ordered: false })
    ]);

    // 9. 返回导入结果
    res.status(200).json({
      success: true,
      data: {
        appsCount: appsResult.length,
        versionsCount: versionsResult.length
      }
    });
  } catch (error: unknown) {
    console.error('Import app error:', error);
    // 处理 MongoDB BulkWriteError（重复 _id 冲突）
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: number }).code === 11000
    ) {
      return res.status(409).json({
        success: false,
        error: '导入失败：存在重复的 ID，请检查是否已导入过相同数据'
      });
    }
    res.status(500).json({ success: false, error: 'Import failed' });
  }
}

export default NextAPI(handler);
