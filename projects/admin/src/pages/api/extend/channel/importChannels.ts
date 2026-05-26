import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { Pool } from 'pg';

const IMPORT_LIMIT = parseInt(process.env.IMPORT_LIMIT || '100', 10);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const AIPROXY_PG_URL = process.env.AIPROXY_PG_URL;

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!AIPROXY_PG_URL) {
      return res.status(500).json({ success: false, error: 'AIPROXY_PG_URL not configured' });
    }

    const { file, keepOriginalId } = req.body;
    if (!file) {
      return res.status(400).json({ success: false, error: 'Missing file in request body' });
    }

    let importData: {
      version?: string;
      type?: string;
      channels?: Array<Record<string, unknown>>;
    };
    try {
      importData = typeof file === 'string' ? JSON.parse(file) : file;
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid JSON format' });
    }

    if (importData.version !== '1.0') {
      return res.status(400).json({ success: false, error: 'Unsupported version' });
    }
    if (importData.type !== 'channels') {
      return res.status(400).json({ success: false, error: 'Invalid import type' });
    }
    if (!Array.isArray(importData.channels)) {
      return res.status(400).json({ success: false, error: 'channels must be an array' });
    }
    if (importData.channels.length > IMPORT_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `Import limit exceeded: maximum ${IMPORT_LIMIT} channels, got ${importData.channels.length}`
      });
    }

    const pool = new Pool({ connectionString: AIPROXY_PG_URL });
    const client = await pool.connect();

    try {
      // 查询现有渠道，构建名称到 ID 的映射
      const { rows: existingChannels } = await client.query(
        'SELECT id, name FROM channels WHERE deleted_at IS NULL'
      );
      const nameToIdMap = new Map<string, number>();
      const idToChannelMap = new Map<number, { id: number; name: string }>();
      for (const ch of existingChannels) {
        if (ch.name) {
          nameToIdMap.set(ch.name, ch.id);
        }
        idToChannelMap.set(ch.id, ch);
      }

      let insertedCount = 0;
      let updatedCount = 0;
      let failedCount = 0;

      for (const channel of importData.channels) {
        if (!channel.name || !channel.type) {
          failedCount++;
          continue;
        }

        try {
          let targetId: number | undefined;

          if (keepOriginalId && channel.id) {
            const originalId = Number(channel.id);
            if (idToChannelMap.has(originalId)) {
              targetId = originalId;
            }
          }

          if (targetId === undefined) {
            targetId = nameToIdMap.get(String(channel.name));
          }

          const modelsJson = JSON.stringify(channel.models ?? []);
          const modelMappingJson = JSON.stringify(channel.model_mapping ?? {});
          const setsJson = JSON.stringify(channel.sets ?? []);
          const configJson = JSON.stringify(channel.config ?? channel.configs ?? {});

          if (targetId !== undefined) {
            // 更新现有渠道
            await client.query(
              `UPDATE channels SET
                name = $1, key = $2, type = $3, base_url = $4,
                models = $5, model_mapping = $6, priority = $7, status = $8,
                sets = $9, enabled_auto_balance_check = $10,
                balance_threshold = $11, config = $12
              WHERE id = $13`,
              [
                String(channel.name),
                String((channel.key as string) ?? ''),
                Number(channel.type),
                String(channel.base_url ?? ''),
                modelsJson,
                modelMappingJson,
                Number(channel.priority ?? 10),
                Number(channel.status ?? 1),
                setsJson,
                Boolean(channel.enabled_auto_balance_check ?? false),
                Number(channel.balance_threshold ?? 0),
                configJson,
                targetId
              ]
            );
            updatedCount++;
          } else {
            // 创建新渠道
            await client.query(
              `INSERT INTO channels (
                name, key, type, base_url, models, model_mapping,
                priority, status, sets, enabled_auto_balance_check,
                balance_threshold, config
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                String(channel.name),
                String((channel.key as string) ?? ''),
                Number(channel.type),
                String(channel.base_url ?? ''),
                modelsJson,
                modelMappingJson,
                Number(channel.priority ?? 10),
                Number(channel.status ?? 1),
                setsJson,
                Boolean(channel.enabled_auto_balance_check ?? false),
                Number(channel.balance_threshold ?? 0),
                configJson
              ]
            );
            insertedCount++;
          }
        } catch (err) {
          console.error(`Failed to import channel "${channel.name}":`, err);
          failedCount++;
        }
      }

      return res.status(200).json({
        success: true,
        data: { insertedCount, updatedCount, failedCount }
      });
    } finally {
      client.release();
      await pool.end();
    }
  } catch (error) {
    console.error('Import channels error:', error);
    return res.status(500).json({ success: false, error: 'Import failed' });
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
