/**
 * API Key 服务单元测试（mock pg 连接池）
 * 覆盖：Key 生成格式、哈希一致性、创建返回结构、认证查询、CRUD 行为
 */

import { Pool } from 'pg';

jest.mock('@fastgpt/service/common/system/log', () => ({
  addLog: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() }
}));

jest.mock('@/service/common/postgres', () => ({
  getPostgresPool: jest.fn()
}));

import { getPostgresPool } from '@/service/common/postgres';
import {
  generateApiKey,
  hashApiKey,
  extractKeyPrefix,
  createApiKey,
  listApiKeys,
  updateApiKey,
  deleteApiKey,
  findUsableByKey,
  touchApiKeyLastUsed,
  API_KEY_PREFIX
} from '@/service/support/apiKey';

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

beforeAll(() => {
  (getPostgresPool as jest.Mock).mockReturnValue(mockPool);
});

beforeEach(() => {
  mockQuery.mockReset();
});

describe('generateApiKey', () => {
  it('以 dek_ 为前缀，总长 47 字符（43 字符 base64url）', () => {
    const key = generateApiKey();
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(key).toHaveLength(47);
    expect(key.slice(4)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('每次生成的 Key 不同（高熵随机）', () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateApiKey()));
    expect(keys.size).toBe(20);
  });
});

describe('hashApiKey', () => {
  it('生成 64 位 hex 哈希', () => {
    const hash = hashApiKey('dek_abc');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('同一 Key 哈希一致，不同 Key 哈希不同', () => {
    const a = 'dek_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const b = 'dek_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    expect(hashApiKey(a)).toBe(hashApiKey(a));
    expect(hashApiKey(a)).not.toBe(hashApiKey(b));
  });
});

describe('extractKeyPrefix', () => {
  it('返回前 8 字符 + ...（不含明文全文）', () => {
    const key = 'dek_abcdefghijklmnopqrstuvwxyz123456';
    const prefix = extractKeyPrefix(key);
    expect(prefix).toBe('dek_abcd...');
    expect(prefix).not.toContain(key.slice(8));
  });
});

describe('createApiKey', () => {
  it('INSERT 后返回明文 key 与记录字段，返回结构不含 key_hash', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'key-id-1',
          key_prefix: 'dek_abc...',
          name: '三方A',
          enabled: true,
          created_at: new Date('2026-01-01T00:00:00Z'),
          updated_at: new Date('2026-01-01T00:00:00Z'),
          last_used_at: null
        }
      ]
    });

    const result = await createApiKey('三方A');

    expect(result.key).toMatch(/^dek_[A-Za-z0-9_-]{43}$/);
    expect(result.id).toBe('key-id-1');
    expect(result.keyPrefix).toBe('dek_abc...');
    expect(result.name).toBe('三方A');
    expect(result.enabled).toBe(true);
    expect('key_hash' in result).toBe(false);

    // INSERT 参数：id、key_hash（64 位 hex）、key_prefix（由真实生成的 key 提取）、name
    const insertArgs = mockQuery.mock.calls[0];
    expect(insertArgs[0]).toContain('INSERT INTO api_keys');
    expect(insertArgs[1][1]).toMatch(/^[0-9a-f]{64}$/);
    expect(insertArgs[1][1]).toBe(hashApiKey(result.key));
    expect(insertArgs[1][2]).toBe(extractKeyPrefix(result.key));
  });
});

describe('listApiKeys', () => {
  it('分页查询且 SELECT 不包含 key_hash', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'id-1',
            key_prefix: 'dek_abc...',
            name: '三方A',
            enabled: true,
            created_at: new Date(),
            updated_at: new Date(),
            last_used_at: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] });

    const result = await listApiKeys(2, 10);

    expect(result).toEqual({
      total: 1,
      list: [expect.objectContaining({ id: 'id-1', keyPrefix: 'dek_abc...' })],
      pageNum: 2,
      pageSize: 10
    });
    const selectSql = mockQuery.mock.calls[0][0] as string;
    expect(selectSql).not.toContain('key_hash');
    expect(mockQuery.mock.calls[0][1]).toEqual([10, 10]); // pageSize, offset
  });
});

describe('findUsableByKey', () => {
  it('命中启用状态的 Key 时返回记录', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'id-1',
          key_prefix: 'dek_abc...',
          name: '三方A',
          enabled: true,
          created_at: new Date(),
          updated_at: new Date(),
          last_used_at: null
        }
      ]
    });

    const key = 'dek_abcdefghijklmnopqrstuvwxyz1234567890123';
    const record = await findUsableByKey(key);

    expect(record).not.toBeNull();
    expect(record?.id).toBe('id-1');
    // 按哈希等值查询，参数是 64 位 hex
    expect(mockQuery.mock.calls[0][1][0]).toMatch(/^[0-9a-f]{64}$/);
    expect(mockQuery.mock.calls[0][1][0]).toBe(hashApiKey(key));
  });

  it('未命中或禁用时返回 null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await findUsableByKey('dek_missing')).toBeNull();
  });
});

describe('updateApiKey', () => {
  it('更新 enabled 字段生成 UPDATE 语句', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'id-1',
          key_prefix: 'dek_abc...',
          name: '三方A',
          enabled: false,
          created_at: new Date(),
          updated_at: new Date(),
          last_used_at: null
        }
      ]
    });

    const record = await updateApiKey('id-1', { enabled: false });

    expect(record?.enabled).toBe(false);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('enabled = $1');
    expect(sql).toContain('updated_at = CURRENT_TIMESTAMP');
    expect(mockQuery.mock.calls[0][1]).toEqual([false, 'id-1']);
  });

  it('无更新字段时直接查询返回现有记录', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'id-1',
          key_prefix: 'dek_abc...',
          name: '三方A',
          enabled: true,
          created_at: new Date(),
          updated_at: new Date(),
          last_used_at: null
        }
      ]
    });

    const record = await updateApiKey('id-1', {});
    expect(record?.id).toBe('id-1');
    expect(mockQuery.mock.calls[0][0]).toContain('SELECT');
  });
});

describe('deleteApiKey / touchApiKeyLastUsed', () => {
  it('删除命中时返回 true', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deleteApiKey('id-1')).toBe(true);
    expect(mockQuery.mock.calls[0]).toEqual(['DELETE FROM api_keys WHERE id = $1', ['id-1']]);
  });

  it('删除未命中时返回 false', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    expect(await deleteApiKey('missing')).toBe(false);
  });

  it('touch 更新 last_used_at', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    await touchApiKeyLastUsed('id-1');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('last_used_at = CURRENT_TIMESTAMP');
    expect(mockQuery.mock.calls[0][1]).toEqual(['id-1']);
  });
});
