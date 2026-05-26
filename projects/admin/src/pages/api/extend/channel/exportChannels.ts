import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { Pool } from 'pg';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const AIPROXY_PG_URL = process.env.AIPROXY_PG_URL;

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!AIPROXY_PG_URL) {
      return res.status(500).json({ success: false, error: 'AIPROXY_PG_URL not configured' });
    }

    const pool = new Pool({ connectionString: AIPROXY_PG_URL });
    const client = await pool.connect();

    try {
      const { rows } = await client.query(
        `SELECT id, name, type, key, base_url, models, model_mapping,
                priority, status, sets, enabled_auto_balance_check,
                balance_threshold, config
         FROM channels WHERE deleted_at IS NULL ORDER BY id`
      );

      const safeChannels = rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        key: row.key,
        base_url: row.base_url,
        models: typeof row.models === 'string' ? JSON.parse(row.models) : row.models ?? [],
        model_mapping:
          typeof row.model_mapping === 'string'
            ? JSON.parse(row.model_mapping)
            : row.model_mapping ?? {},
        priority: row.priority,
        status: row.status,
        sets: typeof row.sets === 'string' ? JSON.parse(row.sets) : row.sets ?? [],
        enabled_auto_balance_check: row.enabled_auto_balance_check,
        balance_threshold: row.balance_threshold,
        config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config ?? {}
      }));

      const exportData = {
        version: '1.0',
        type: 'channels',
        exportTime: new Date().toISOString(),
        channels: safeChannels
      };

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=channel-export-${Date.now()}.json`
      );
      res.status(200).json(exportData);
    } finally {
      client.release();
      await pool.end();
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Export channels error:', errMsg);
    res.status(500).json({ success: false, error: errMsg });
  }
}

export default NextAPI(handler);
