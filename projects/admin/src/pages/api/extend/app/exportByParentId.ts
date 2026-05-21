import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { findAppAndAllChildren } from '@fastgpt/service/core/app/controller';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authJWT } from '@fastgpt/service/support/permission/controller';

const EXPORT_LIMIT = 50000;

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

    // 从 JWT payload 中获取 teamId
    const teamId = decoded?.team?.teamId;
    if (!teamId) {
      return res.status(401).json({ success: false, error: '无法获取团队信息' });
    }

    // 4. 获取并验证 parentId
    const { parentId } = req.body;
    if (!parentId || !/^[0-9a-fA-F]{24}$/.test(parentId)) {
      return res.status(400).json({ success: false, error: 'Invalid parentId format' });
    }

    // 5. 递归查找所有子应用
    const apps = await findAppAndAllChildren({
      teamId,
      appId: parentId
    });

    const appIds = apps.map((a) => a._id);

    // 6. 检查数据量是否超过限制
    const versionCount = await MongoAppVersion.countDocuments({
      appId: { $in: appIds }
    });

    if (versionCount > EXPORT_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `数据量过大（共 ${versionCount} 条，限制 ${EXPORT_LIMIT} 条），请缩小导出范围后重试`
      });
    }

    // 7. 查询版本数据
    const versions = await MongoAppVersion.find({ appId: { $in: appIds } })
      .limit(EXPORT_LIMIT)
      .lean();

    // 8. 组装导出数据
    const exportData = {
      version: '1.0',
      type: 'app',
      exportTime: new Date().toISOString(),
      teamId,
      apps,
      versions
    };

    // 9. 设置响应头并返回
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=app-export-${Date.now()}.json`
    );
    res.status(200).json(exportData);
  } catch (error) {
    console.error('Export app error:', error);
    res.status(500).json({ success: false, error: 'Export failed' });
  }
}

export default NextAPI(handler);
