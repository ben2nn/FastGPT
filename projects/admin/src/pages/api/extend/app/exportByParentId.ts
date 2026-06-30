import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';

import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authAdmin } from '@/service/support/permission/auth';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';

const EXPORT_LIMIT = parseInt(process.env.EXPORT_LIMIT || '50000', 10);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. 连接数据库

    // 2. 验证请求方法
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // 3. 验证认证
    const authResult = await authAdmin(req);
    const teamId = authResult.teamId;
    if (!teamId) {
      return res.status(401).json({ success: false, error: '无法获取团队信息' });
    }

    // 4. 获取并验证 parentId
    const { parentId, keepApiKey } = req.body as { parentId?: string; keepApiKey?: boolean };
    if (!parentId || !/^[0-9a-fA-F]{24}$/.test(parentId)) {
      return res.status(400).json({ success: false, error: 'Invalid parentId format' });
    }

    // 5. 递归查找所有子应用（动态导入避免触发 MQ/Redis 连接）
    const { findAppAndAllChildren } = await import('@/service/core/app');
    const apps = await findAppAndAllChildren({
      teamId,
      appId: parentId
    });

    const appIds = apps.map((a) => a._id);

    // 6. 查询关联的 OutLink（免登录窗口 + 门户配置）
    const outLinks = await MongoOutLink.find({ appId: { $in: appIds } })
      .select('-teamId -tmbId -usagePoints -lastTime')
      .lean();

    // 查询关联的 OpenApi（API 访问 Key）
    const openApiProjection: Record<string, number> = {
      teamId: 0,
      tmbId: 0,
      usagePoints: 0,
      lastUsedTime: 0,
      createTime: 0
    };
    if (!keepApiKey) {
      openApiProjection.apiKey = 0;
    }
    const openApis = await MongoOpenApi.find({ appId: { $in: appIds } })
      .select(openApiProjection)
      .lean();

    // 7. 检查数据量是否超过限制
    const versionCount = await MongoAppVersion.countDocuments({
      appId: { $in: appIds }
    });

    if (versionCount > EXPORT_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `数据量过大（共 ${versionCount} 条，限制 ${EXPORT_LIMIT} 条），请缩小导出范围后重试`
      });
    }

    // 8. 查询版本数据
    const versions = await MongoAppVersion.find({ appId: { $in: appIds } })
      .limit(EXPORT_LIMIT)
      .lean();

    // 9. 组装导出数据
    const exportData = {
      version: '2.0',
      type: 'app',
      exportTime: new Date().toISOString(),
      teamId,
      apps,
      versions,
      outLinks,
      openApis
    };

    // 10. 设置响应头并返回
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=app-export-${Date.now()}.json`);
    res.status(200).json(exportData);
  } catch (error) {
    console.error('Export app error:', error);
    res.status(500).json({ success: false, error: 'Export failed' });
  }
}

export default NextAPI(handler);
