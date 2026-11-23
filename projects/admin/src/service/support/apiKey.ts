/**
 * 对外 API Key 服务
 * 负责三方对接 Key 的生成、哈希存储与生命周期管理（CRUD）
 *
 * 安全约定：
 * - Key 明文仅在创建时返回一次，数据库仅存 SHA-256 哈希
 * - key_prefix 用于列表展示识别（前 8 字符 + '...'），不含明文全文
 * - 认证查询按哈希等值匹配，未命中/禁用统一拒绝
 */

import { createHash, randomBytes, randomUUID } from 'crypto';
import { addLog } from '@fastgpt/service/common/system/log';
import { getPostgresPool } from '@/service/common/postgres';

/** Key 前缀，便于日志脱敏与肉眼识别 */
export const API_KEY_PREFIX = 'dek_';

/** API Key 记录（不含 Key 明文与哈希原文的完整形态视接口而定） */
export type ApiKeyRecord = {
  id: string;
  keyPrefix: string;
  name: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
};

/** 生成新的 API Key 明文：dek_ + 32 字节 base64url（43 字符，总长 47） */
export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

/** 计算 Key 的 SHA-256 hex 哈希（64 字符） */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** 提取展示用前缀（前 8 字符 + '...'） */
export function extractKeyPrefix(key: string): string {
  return `${key.slice(0, 8)}...`;
}

/**
 * 创建 API Key
 * @returns 含明文 key 的完整信息（明文仅在此次响应中返回）
 */
export async function createApiKey(name: string): Promise<{ key: string } & ApiKeyRecord> {
  const key = generateApiKey();
  const keyHash = hashApiKey(key);
  const keyPrefix = extractKeyPrefix(key);
  const id = randomUUID();

  const pool = getPostgresPool();
  const result = await pool.query(
    `INSERT INTO api_keys (id, key_hash, key_prefix, name, enabled)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, key_prefix, name, enabled, created_at, updated_at, last_used_at`,
    [id, keyHash, keyPrefix, name]
  );

  const row = result.rows[0];
  addLog.info('[ApiKeyService] 创建 API Key', { id, keyPrefix, name });

  return {
    key,
    id: row.id,
    keyPrefix: row.key_prefix,
    name: row.name,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at
  };
}

/** 分页查询 Key 列表（按创建时间倒序），不含哈希与明文 */
export async function listApiKeys(
  pageNum = 1,
  pageSize = 20
): Promise<{ total: number; list: ApiKeyRecord[]; pageNum: number; pageSize: number }> {
  const pool = getPostgresPool();
  const offset = (pageNum - 1) * pageSize;

  const [listResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, key_prefix, name, enabled, created_at, updated_at, last_used_at
       FROM api_keys
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    ),
    pool.query('SELECT COUNT(*) as total FROM api_keys')
  ]);

  const list: ApiKeyRecord[] = listResult.rows.map((row) => ({
    id: row.id,
    keyPrefix: row.key_prefix,
    name: row.name,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at
  }));

  return {
    total: parseInt(countResult.rows[0].total, 10),
    list,
    pageNum,
    pageSize
  };
}

/** 更新 Key（启用状态 / 名称），仅更新传入的字段 */
export async function updateApiKey(
  id: string,
  updates: { enabled?: boolean; name?: string }
): Promise<ApiKeyRecord | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.enabled !== undefined) {
    fields.push(`enabled = $${paramIndex++}`);
    values.push(updates.enabled);
  }
  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }

  if (fields.length === 0) {
    const existing = await getApiKeyById(id);
    return existing;
  }

  values.push(id);
  const pool = getPostgresPool();
  const result = await pool.query(
    `UPDATE api_keys SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${paramIndex}
     RETURNING id, key_prefix, name, enabled, created_at, updated_at, last_used_at`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0];
  return {
    id: row.id,
    keyPrefix: row.key_prefix,
    name: row.name,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at
  };
}

/** 删除 Key */
export async function deleteApiKey(id: string): Promise<boolean> {
  const pool = getPostgresPool();
  const result = await pool.query('DELETE FROM api_keys WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/** 按明文 Key 认证：哈希后查询启用状态的 Key，未命中返回 null */
export async function findUsableByKey(key: string): Promise<ApiKeyRecord | null> {
  const keyHash = hashApiKey(key);
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT id, key_prefix, name, enabled, created_at, updated_at, last_used_at
     FROM api_keys
     WHERE key_hash = $1 AND enabled = true`,
    [keyHash]
  );

  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0];
  return {
    id: row.id,
    keyPrefix: row.key_prefix,
    name: row.name,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at
  };
}

/** 更新最近使用时间（异步调用，不阻塞认证主流程） */
export async function touchApiKeyLastUsed(id: string): Promise<void> {
  const pool = getPostgresPool();
  await pool.query('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
}

/** 按 ID 查询 Key 记录（管理接口用），不含哈希 */
export async function getApiKeyById(id: string): Promise<ApiKeyRecord | null> {
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT id, key_prefix, name, enabled, created_at, updated_at, last_used_at
     FROM api_keys
     WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0];
  return {
    id: row.id,
    keyPrefix: row.key_prefix,
    name: row.name,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at
  };
}
