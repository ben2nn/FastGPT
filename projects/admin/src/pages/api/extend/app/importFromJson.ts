import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';

import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authAdmin } from '@/service/support/permission/auth';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { Types } from 'mongoose';

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
    const tmbId = authResult.tmbId;
    if (!teamId || !tmbId) {
      return res.status(401).json({ success: false, error: '无法获取团队信息' });
    }

    // 4. 解析请求体
    const { file, keepOriginalId, targetId, targetType, keepApiKey } = req.body as {
      file: unknown;
      keepOriginalId?: boolean;
      targetId?: string;
      targetType?: string;
      keepApiKey?: boolean;
    };

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
    if (!['1.0', '2.0'].includes(importData.version) || importData.type !== 'app') {
      return res.status(400).json({ success: false, error: 'Invalid import file format' });
    }

    const { apps, versions } = importData;
    const outLinks: Record<string, unknown>[] = importData.outLinks || [];
    const openApis: Record<string, unknown>[] = importData.openApis || [];

    // 验证数组字段
    if (!Array.isArray(apps) || !Array.isArray(versions)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid import file structure: missing required arrays'
      });
    }

    // 6.5. 检查导入数据量限制
    const IMPORT_LIMIT = parseInt(process.env.IMPORT_LIMIT || '50000', 10);
    const totalDocs = apps.length + versions.length + outLinks.length + openApis.length;
    if (totalDocs > IMPORT_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `导入数据量超过限制：${totalDocs} 条，最大允许 ${IMPORT_LIMIT} 条`
      });
    }

    // 7. 处理 ID 映射
    const idMap = new Map<string, string>();

    if (!keepOriginalId) {
      // 为所有文档生成新 ID
      const allDocs = [...apps, ...versions, ...outLinks, ...openApis];
      for (const doc of allDocs) {
        const oldId = String(doc._id);
        const newId = new Types.ObjectId().toString();
        idMap.set(oldId, newId);
      }
    }

    // 8. 更新文档引用
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
          updated.parentId = null;
        } else {
          updated.parentId = newParentId;
        }
      }
      updated.teamId = teamId;
      updated.tmbId = tmbId;
      return updated;
    };

    // 8.5. 目标位置重复检测
    if (targetId) {
      if (targetType === 'folder') {
        // 目录：递归查找目录下所有子 app，按 _id 检测重复
        // 递归查找所有后代
        const allDescendants: string[] = [];
        const collectChildren = async (parentId: string) => {
          const kids = await MongoApp.find({ teamId, parentId }, '_id').lean();
          for (const kid of kids) {
            allDescendants.push(String(kid._id));
            await collectChildren(String(kid._id));
          }
        };
        await collectChildren(targetId);

        const existingIdSet = new Set(allDescendants);
        const importIds = apps.map((doc: Record<string, unknown>) => String(doc._id));
        const conflictIds = importIds.filter((id: string) => existingIdSet.has(id));

        if (conflictIds.length > 0) {
          return res.status(409).json({
            success: false,
            error: `目标目录下已存在 ${conflictIds.length} 个同 ID 工作流，请先删除后再导入`
          });
        }
      } else {
        // 工作流：按 _id 查找
        const existingApp = await MongoApp.findOne({ _id: targetId, teamId });
        if (existingApp) {
          return res.status(409).json({
            success: false,
            error: `目标工作流「${existingApp.name}」已存在，请先删除后再导入`
          });
        }
      }
    }

    // 9. 更新文档
    const updatedApps = apps.map((doc: Record<string, unknown>) => {
      const updated = updateDoc(doc);
      if (targetType === 'folder' && targetId) {
        updated.parentId = targetId;
      }
      return updated;
    });

    const updatedVersions = versions.map((doc: Record<string, unknown>) => {
      const updated = updateDoc(doc);
      // 版本文档通过 appId 关联应用
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

    // 10. 分批写入数据库
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

    // 11. 返回导入结果
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
    console.error('Import app error:', error);
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
