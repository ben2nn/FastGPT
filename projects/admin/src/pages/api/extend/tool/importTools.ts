import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';

import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authAdmin } from '@/service/support/permission/auth';
import { ToolTypeList, AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { Types } from 'mongoose';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const authResult = await authAdmin(req);
    const teamId = authResult.teamId;
    const tmbId = authResult.tmbId;
    if (!teamId || !tmbId) {
      return res.status(401).json({ success: false, error: '无法获取团队信息' });
    }

    // 解析请求体
    const { file, keepOriginalId, targetParentId, keepApiKey } = req.body as {
      file: unknown;
      keepOriginalId?: boolean;
      targetParentId?: string;
      keepApiKey?: boolean;
    };

    if (!file) {
      return res.status(400).json({ success: false, error: 'File is required' });
    }

    // 解析 JSON
    let importData;
    try {
      importData = typeof file === 'string' ? JSON.parse(file) : file;
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid JSON format' });
    }

    // 校验格式
    if (!['1.0', '2.0'].includes(importData.version) || importData.type !== 'tool') {
      return res.status(400).json({ success: false, error: 'Invalid import file format' });
    }

    const { apps, versions } = importData;
    const outLinks: Record<string, unknown>[] = importData.outLinks || [];
    const openApis: Record<string, unknown>[] = importData.openApis || [];

    if (!Array.isArray(apps) || !Array.isArray(versions)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid import file structure: missing required arrays'
      });
    }

    // 校验 apps 中的 type 均为工具类型或文件夹类型
    const allowedTypes = [...ToolTypeList, ...AppFolderTypeList];
    const invalidApps = apps.filter(
      (app: Record<string, unknown>) => !allowedTypes.includes(app.type as any)
    );
    if (invalidApps.length > 0) {
      return res.status(400).json({
        success: false,
        error: `导入数据中包含非工具类型的应用：${invalidApps.map((a: Record<string, unknown>) => a.name || a._id).join(', ')}`
      });
    }

    // 检查导入数据量限制
    const IMPORT_LIMIT = parseInt(process.env.IMPORT_LIMIT || '50000', 10);
    const totalDocs = apps.length + versions.length + outLinks.length + openApis.length;
    if (totalDocs > IMPORT_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `导入数据量超过限制：${totalDocs} 条，最大允许 ${IMPORT_LIMIT} 条`
      });
    }

    // ID 映射处理
    const idMap = new Map<string, string>();

    if (!keepOriginalId) {
      const allDocs = [...apps, ...versions, ...outLinks, ...openApis];
      for (const doc of allDocs) {
        const oldId = String(doc._id);
        const newId = new Types.ObjectId().toString();
        idMap.set(oldId, newId);
      }
    }

    const updateId = (id: string) => {
      if (keepOriginalId) return id;
      return idMap.get(id) || id;
    };

    const updateDoc = (doc: Record<string, unknown>) => {
      const updated = { ...doc };
      updated._id = updateId(String(doc._id));
      if (updated.parentId) {
        const oldParentId = String(updated.parentId);
        const newParentId = updateId(oldParentId);
        if (!keepOriginalId && newParentId === oldParentId) {
          // parentId 不在导出范围内，清空以避免挂到源系统的文件夹
          updated.parentId = null;
        } else {
          updated.parentId = newParentId;
        }
      }
      updated.teamId = teamId;
      updated.tmbId = tmbId;
      return updated;
    };

    const updatedApps = apps.map((doc: Record<string, unknown>) => {
      const updated = updateDoc(doc);
      if (targetParentId) {
        updated.parentId = targetParentId;
      }
      return updated;
    });

    const updatedVersions = versions.map((doc: Record<string, unknown>) => {
      const updated = updateDoc(doc);
      if (updated.appId) {
        updated.appId = updateId(String(updated.appId));
      }
      return updated;
    });

    const updatedOutLinks = outLinks.map((doc: Record<string, unknown>) => {
      const updated = { ...doc };
      updated._id = updateId(String(doc._id));
      if (updated.appId) {
        updated.appId = updateId(String(updated.appId));
      }
      updated.teamId = teamId;
      updated.tmbId = tmbId;
      return updated;
    });

    const updatedOpenApis = openApis.map((doc: Record<string, unknown>) => {
      const updated = { ...doc };
      updated._id = updateId(String(doc._id));
      if (updated.appId) {
        updated.appId = updateId(String(updated.appId));
      }
      updated.teamId = teamId;
      updated.tmbId = tmbId;
      if (!keepApiKey) {
        const nanoid = getNanoid(Math.floor(Math.random() * 14) + 52);
        updated.apiKey = `fastgpt-${nanoid}`;
      }
      updated.createTime = new Date();
      updated.usagePoints = 0;
      return updated;
    });

    // 分批写入
    const BATCH_SIZE = 2000;
    const duplicateWarnings: string[] = [];

    async function batchInsert<T extends Record<string, unknown>>(
      model: { insertMany: (docs: T[], opts: Record<string, unknown>) => Promise<T[]> },
      docs: T[],
      name: string
    ) {
      let insertedCount = 0;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        try {
          const result = await model.insertMany(batch, { ordered: false });
          insertedCount += result.length;
        } catch (err: unknown) {
          if (err instanceof Error && 'code' in err && (err as { code: number }).code === 11000) {
            const writeResult = (err as { result?: { insertedCount?: number } }).result;
            if (writeResult?.insertedCount) {
              insertedCount += writeResult.insertedCount;
            }
            const dupCount = batch.length - (writeResult?.insertedCount ?? 0);
            duplicateWarnings.push(`${name}: ${dupCount} 条重复已跳过`);
          } else {
            throw err;
          }
        }
      }
      return insertedCount;
    }

    const [appsCount, versionsCount, outLinksCount, openApisCount] = await Promise.all([
      batchInsert(MongoApp, updatedApps, 'apps'),
      batchInsert(MongoAppVersion, updatedVersions, 'versions'),
      updatedOutLinks.length > 0
        ? batchInsert(MongoOutLink, updatedOutLinks, 'outLinks')
        : Promise.resolve(0),
      updatedOpenApis.length > 0
        ? batchInsert(MongoOpenApi, updatedOpenApis, 'openApis')
        : Promise.resolve(0)
    ]);

    res.status(200).json({
      success: true,
      data: {
        appsCount,
        versionsCount,
        outLinksCount,
        openApisCount,
        ...(duplicateWarnings.length > 0 ? { warnings: duplicateWarnings } : {})
      }
    });
  } catch (error) {
    console.error('Import tools error:', error);
    res.status(500).json({ success: false, error: 'Import failed' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb'
    }
  }
};

export default NextAPI(handler);
