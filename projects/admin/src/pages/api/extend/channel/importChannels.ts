import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';

const IMPORT_LIMIT = 100;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const AIPROXY_API_ENDPOINT = process.env.AIPROXY_API_ENDPOINT;
  const AIPROXY_API_TOKEN = process.env.AIPROXY_API_TOKEN;

  try {
    // 1. 验证请求方法
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // 2. 验证 AI Proxy 配置
    if (!AIPROXY_API_ENDPOINT || !AIPROXY_API_TOKEN) {
      return res.status(500).json({ success: false, error: 'AI Proxy not configured' });
    }

    // 3. 解析请求体
    const { file } = req.body;
    if (!file) {
      return res.status(400).json({ success: false, error: 'Missing file in request body' });
    }

    // 4. 解析 JSON 数据
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

    // 5. 验证版本和类型
    if (importData.version !== '1.0') {
      return res.status(400).json({ success: false, error: 'Unsupported version' });
    }
    if (importData.type !== 'channels') {
      return res.status(400).json({ success: false, error: 'Invalid import type' });
    }

    // 6. 验证 channels 为数组
    if (!Array.isArray(importData.channels)) {
      return res.status(400).json({ success: false, error: 'channels must be an array' });
    }

    // 7. 检查导入数量限制
    if (importData.channels.length > IMPORT_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `Import limit exceeded: maximum ${IMPORT_LIMIT} channels, got ${importData.channels.length}`
      });
    }

    // 8. 获取现有渠道列表
    const channelsResponse = await fetch(
      `${AIPROXY_API_ENDPOINT}/api/channels/all`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${AIPROXY_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!channelsResponse.ok) {
      throw new Error(`AI Proxy API error: ${channelsResponse.status}`);
    }

    const channelsData = await channelsResponse.json();
    if (!Array.isArray(channelsData.data)) {
      throw new Error('Invalid API response: data.data is not an array');
    }
    const existingChannels: Array<{ id: number; name: string }> = channelsData.data;

    // 9. 构建名称到 ID 的映射
    const nameToIdMap = new Map<string, number>();
    for (const ch of existingChannels) {
      if (ch.name) {
        nameToIdMap.set(ch.name, ch.id);
      }
    }

    // 10. 逐个导入渠道（创建或更新）
    let insertedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    for (const channel of importData.channels) {
      // 验证必填字段
      if (!channel.name || !channel.type) {
        failedCount++;
        continue;
      }

      try {
        const existingId = nameToIdMap.get(String(channel.name));

        if (existingId) {
          // 更新现有渠道
          const updateResponse = await fetch(
            `${AIPROXY_API_ENDPOINT}/api/channel/${existingId}`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${AIPROXY_API_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: channel.name,
                type: channel.type,
                base_url: channel.base_url ?? '',
                models: channel.models ?? [],
                model_mapping: channel.model_mapping ?? {},
                priority: channel.priority ?? 0,
                key: (channel.key as string) ?? ''
              })
            }
          );

          if (updateResponse.ok) {
            updatedCount++;
          } else {
            console.warn(
              `Failed to update channel "${channel.name}": ${updateResponse.status}`
            );
            failedCount++;
          }
        } else {
          // 创建新渠道
          const createResponse = await fetch(
            `${AIPROXY_API_ENDPOINT}/api/channel/`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${AIPROXY_API_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: channel.name,
                type: channel.type,
                base_url: channel.base_url ?? '',
                models: channel.models ?? [],
                model_mapping: channel.model_mapping ?? {},
                priority: channel.priority ?? 0,
                key: (channel.key as string) ?? ''
              })
            }
          );

          if (createResponse.ok) {
            insertedCount++;
          } else {
            console.warn(
              `Failed to create channel "${channel.name}": ${createResponse.status}`
            );
            failedCount++;
          }
        }
      } catch {
        failedCount++;
      }
    }

    // 11. 返回导入结果
    return res.status(200).json({
      success: true,
      data: {
        insertedCount,
        updatedCount,
        failedCount
      }
    });
  } catch (error) {
    console.error('Import channels error:', error);
    return res.status(500).json({ success: false, error: 'Import failed' });
  }
}

export default NextAPI(handler);
