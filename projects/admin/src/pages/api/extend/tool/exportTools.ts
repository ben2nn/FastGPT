import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authJWT } from '@fastgpt/service/support/permission/controller';
import { ToolTypeList } from '@fastgpt/global/core/app/constants';

const EXPORT_LIMIT = parseInt(process.env.EXPORT_LIMIT || '50000', 10);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // JWT 认证
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

    const teamId = decoded?.team?.teamId;
    if (!teamId) {
      return res.status(401).json({ success: false, error: '无法获取团队信息' });
    }

    // 获取 parentId（可选）
    const { parentId } = req.body;

    let apps;

    if (parentId) {
      // 有 parentId：递归查找后按工具类型过滤
      if (!/^[0-9a-fA-F]{24}$/.test(parentId)) {
        return res.status(400).json({ success: false, error: 'Invalid parentId format' });
      }

      const { findAppAndAllChildren } = await import('@fastgpt/service/core/app/controller');
      const allChildren = await findAppAndAllChildren({
        teamId,
        appId: parentId
      });

      apps = allChildren.filter((app) => ToolTypeList.includes(app.type as any));
    } else {
      // 无 parentId：导出当前团队所有工具类型应用
      apps = await MongoApp.find({
        teamId,
        type: { $in: ToolTypeList }
      }).lean();
    }

    if (apps.length === 0) {
      return res.status(200).json({
        version: '1.0',
        type: 'tool',
        exportTime: new Date().toISOString(),
        teamId,
        apps: [],
        versions: []
      });
    }

    const appIds = apps.map((a) => a._id);

    // 检查数据量限制
    const versionCount = await MongoAppVersion.countDocuments({
      appId: { $in: appIds }
    });

    if (versionCount > EXPORT_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `数据量过大（共 ${versionCount} 条，限制 ${EXPORT_LIMIT} 条），请缩小导出范围后重试`
      });
    }

    const versions = await MongoAppVersion.find({ appId: { $in: appIds } })
      .limit(EXPORT_LIMIT)
      .lean();

    const exportData = {
      version: '1.0',
      type: 'tool',
      exportTime: new Date().toISOString(),
      teamId,
      apps,
      versions
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=tool-export-${Date.now()}.json`);
    res.status(200).json(exportData);
  } catch (error) {
    console.error('Export tools error:', error);
    res.status(500).json({ success: false, error: 'Export failed' });
  }
}

export default NextAPI(handler);
