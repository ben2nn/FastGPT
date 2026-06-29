import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authAdmin } from '@/service/common/auth';
import { ToolTypeList, AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';

const EXPORT_LIMIT = parseInt(process.env.EXPORT_LIMIT || '50000', 10);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const authResult = await authAdmin(req);
    const teamId = authResult.teamId;
    if (!teamId) {
      return res.status(401).json({ success: false, error: '无法获取团队信息' });
    }

    // 获取 parentId（可选）
    const { parentId, keepApiKey } = req.body as { parentId?: string; keepApiKey?: boolean };

    let apps;

    if (parentId) {
      // 有 parentId：递归查找后按工具类型过滤
      if (!/^[0-9a-fA-F]{24}$/.test(parentId)) {
        return res.status(400).json({ success: false, error: 'Invalid parentId format' });
      }

      const { findAppAndAllChildren } = await import('@/service/core/app');
      const allChildren = await findAppAndAllChildren({
        teamId,
        appId: parentId
      });

      const tools = allChildren.filter((app) => ToolTypeList.includes(app.type as any));

      // 收集工具依赖的文件夹（向上递归到根）
      const folderIds = new Set<string>();
      for (const tool of tools) {
        if (tool.parentId) folderIds.add(String(tool.parentId));
      }
      const allChildrenMap = new Map(allChildren.map((a) => [String(a._id), a]));
      const folders: typeof tools = [];
      for (const fid of folderIds) {
        let cur: string | undefined = fid;
        while (cur && !folders.some((f) => String(f._id) === cur)) {
          const node = allChildrenMap.get(cur);
          if (node && AppFolderTypeList.includes(node.type as any)) {
            folders.push(node);
            cur = node.parentId ? String(node.parentId) : undefined;
          } else {
            break;
          }
        }
      }

      apps = [...folders, ...tools];
    } else {
      // 无 parentId：导出当前团队所有工具类型应用
      apps = await MongoApp.find({
        teamId,
        type: { $in: ToolTypeList }
      }).lean();
    }

    if (apps.length === 0) {
      return res.status(200).json({
        version: '2.0',
        type: 'tool',
        exportTime: new Date().toISOString(),
        teamId,
        apps: [],
        versions: [],
        outLinks: [],
        openApis: []
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

    const outLinks = await MongoOutLink.find({ appId: { $in: appIds } })
      .select('-teamId -tmbId -usagePoints -lastTime')
      .lean();

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

    const exportData = {
      version: '2.0',
      type: 'tool',
      exportTime: new Date().toISOString(),
      teamId,
      apps,
      versions,
      outLinks,
      openApis
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
