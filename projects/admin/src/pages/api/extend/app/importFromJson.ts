import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';

import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authAdmin } from '@/service/support/permission/auth';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { Types } from 'mongoose';
import formidable from 'formidable';
import { readFile, unlink } from 'fs/promises';

// 禁用默认 bodyParser，使用 formidable 处理文件上传。
// 默认 bodyParser 会把整个请求体读入内存并受 sizeLimit 限制（超过即返回 413），
// 而应用导出文件可能达到几百 MB，这里改为流式写入临时文件，避免 413 与内存翻倍。
export const config = {
  api: {
    bodyParser: false
  }
};

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

type ParsedForm = {
  fields: formidable.Fields;
  files: formidable.Files;
};

function parseFormData(req: NextApiRequest): Promise<ParsedForm> {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
      keepExtensions: true
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
      } else {
        resolve({ fields, files });
      }
    });
  });
}

// 兼容 JSON 请求体（老客户端），手动读取原始流，不受 bodyParser 限制
async function readJsonBody(req: NextApiRequest): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

function getField(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. 验证请求方法
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // 2. 验证认证
    const authResult = await authAdmin(req);
    const teamId = authResult.teamId;
    const tmbId = authResult.tmbId;
    if (!teamId || !tmbId) {
      return res.status(401).json({ success: false, error: '无法获取团队信息' });
    }

    // 3. 解析请求体（multipart/form-data 优先，兼容旧版 JSON 请求体）
    const contentType = String(req.headers['content-type'] || '');
    let importData: Record<string, unknown> = {};
    let keepOriginalId = false;
    let keepApiKey = false;
    let targetId: string | undefined;
    let targetType: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      let fields: formidable.Fields;
      let files: formidable.Files;
      try {
        ({ fields, files } = await parseFormData(req));
      } catch (error) {
        console.error('Parse form data error:', error);
        return res.status(400).json({
          success: false,
          error: '文件上传失败：' + (error instanceof Error ? error.message : '未知错误')
        });
      }

      keepOriginalId = getField(fields.keepOriginalId) === 'true';
      keepApiKey = getField(fields.keepApiKey) === 'true';
      targetId = getField(fields.targetId) || undefined;
      targetType = getField(fields.targetType) || undefined;

      const fileField = files.file;
      const uploadedFile = Array.isArray(fileField) ? fileField[0] : fileField;
      if (!uploadedFile) {
        return res.status(400).json({ success: false, error: 'File is required' });
      }

      try {
        const content = await readFile(uploadedFile.filepath, 'utf-8');
        importData = JSON.parse(content) as Record<string, unknown>;
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid JSON format' });
      } finally {
        // 清理临时文件
        await unlink(uploadedFile.filepath).catch(() => {});
      }
    } else {
      let body: {
        file?: unknown;
        keepOriginalId?: boolean;
        targetId?: string;
        targetType?: string;
        keepApiKey?: boolean;
      };
      try {
        body = (await readJsonBody(req)) as typeof body;
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid JSON format' });
      }

      const { file } = body;
      keepOriginalId = body.keepOriginalId === true;
      keepApiKey = body.keepApiKey === true;
      targetId = body.targetId;
      targetType = body.targetType;

      if (!file) {
        return res.status(400).json({ success: false, error: 'File is required' });
      }

      try {
        importData = (typeof file === 'string' ? JSON.parse(file) : file) as Record<
          string,
          unknown
        >;
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid JSON format' });
      }
    }

    // 4. 验证 JSON 结构
    if (!['1.0', '2.0'].includes(importData.version as string) || importData.type !== 'app') {
      return res.status(400).json({ success: false, error: 'Invalid import file format' });
    }

    const { apps, versions } = importData as {
      apps: Record<string, unknown>[];
      versions: Record<string, unknown>[];
    };
    const outLinks: Record<string, unknown>[] = Array.isArray(importData.outLinks)
      ? (importData.outLinks as Record<string, unknown>[])
      : [];
    const openApis: Record<string, unknown>[] = Array.isArray(importData.openApis)
      ? (importData.openApis as Record<string, unknown>[])
      : [];

    // 验证数组字段
    if (!Array.isArray(apps) || !Array.isArray(versions)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid import file structure: missing required arrays'
      });
    }

    // 4.5. 检查导入数据量限制
    const IMPORT_LIMIT = parseInt(process.env.IMPORT_LIMIT || '50000', 10);
    const totalDocs = apps.length + versions.length + outLinks.length + openApis.length;
    if (totalDocs > IMPORT_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `导入数据量超过限制：${totalDocs} 条，最大允许 ${IMPORT_LIMIT} 条`
      });
    }

    // 5. 处理 ID 映射
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

    // 6. 更新文档引用
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

    // 6.5. 目标位置重复检测
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

    // 7. 更新文档
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

    // 8. 分批写入数据库
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

    // 9. 返回导入结果
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

export default NextAPI(handler);
