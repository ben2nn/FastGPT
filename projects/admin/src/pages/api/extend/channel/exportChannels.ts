import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';

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

    // 3. 调用 AI Proxy API 获取渠道列表
    const response = await fetch(`${AIPROXY_API_ENDPOINT}/api/channels/all`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AIPROXY_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`AI Proxy API error: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data.data)) {
      throw new Error('Invalid API response: data.data is not an array');
    }
    const channels = data.data;

    // 4. 过滤敏感信息（不导出 key）
    const safeChannels = channels.map((channel: Record<string, unknown>) => ({
      name: channel.name,
      type: channel.type,
      base_url: channel.base_url,
      models: channel.models,
      model_mapping: channel.model_mapping,
      priority: channel.priority
    }));

    // 5. 组装导出数据
    const exportData = {
      version: '1.0',
      type: 'channels',
      exportTime: new Date().toISOString(),
      channels: safeChannels
    };

    // 6. 设置响应头并返回
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=channel-export-${Date.now()}.json`
    );
    res.status(200).json(exportData);
  } catch (error) {
    console.error('Export channels error:', error);
    res.status(500).json({ success: false, error: 'Export failed' });
  }
}

export default NextAPI(handler);
