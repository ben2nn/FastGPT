import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authJWT } from '@fastgpt/service/support/permission/controller';
import { ToolTypeList } from '@fastgpt/global/core/app/constants';
import { Types } from 'mongoose';

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
    const tmbId = decoded?.team?.tmbId;
    if (!teamId || !tmbId) {
      return res.status(401).json({ success: false, error: '无法获取团队信息' });
    }

    // 解析请求体
    const { file, keepOriginalId, targetParentId } = req.body;

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
    if (importData.version !== '1.0' || importData.type !== 'tool') {
      return res.status(400).json({ success: false, error: 'Invalid import file format' });
    }

    const { apps, versions } = importData;

    if (!Array.isArray(apps) || !Array.isArray(versions)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid import file structure: missing required arrays'
      });
    }

    // 校验 apps 中的 type 均为工具类型
    const invalidApps = apps.filter(
      (app: Record<string, unknown>) => !ToolTypeList.includes(app.type as any)
    );
    if (invalidApps.length > 0) {
      return res.status(400).json({
        success: false,
        error: `导入数据中包含非工具类型的应用：${invalidApps.map((a: Record<string, unknown>) => a.name || a._id).join(', ')}`
      });
    }

    // 检查导入数据量限制
    const IMPORT_LIMIT = parseInt(process.env.IMPORT_LIMIT || '50000', 10);
    const totalDocs = apps.length + versions.length;
    if (totalDocs > IMPORT_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `导入数据量超过限制：${totalDocs} 条，最大允许 ${IMPORT_LIMIT} 条`
      });
    }

    // ID 映射处理
    const idMap = new Map<string, string>();

    if (!keepOriginalId) {
      const allDocs = [...apps, ...versions];
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
        updated.parentId = updateId(String(updated.parentId));
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

    const [appsCount, versionsCount] = await Promise.all([
      batchInsert(MongoApp, updatedApps, 'apps'),
      batchInsert(MongoAppVersion, updatedVersions, 'versions')
    ]);

    res.status(200).json({
      success: true,
      data: {
        appsCount,
        versionsCount,
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
