/**
 * SQL 脚本管理模块
 * 负责加载和管理数据库初始化脚本
 */

import { getSchemaContent } from './schemaContent';

/**
 * 读取 SQL 文件内容
 */
function readSqlFile(filename: string): string {
  if (filename === 'schema.sql') {
    return getSchemaContent();
  }
  throw new Error(`不支持的 SQL 文件: ${filename}`);
}

/**
 * 解析 SQL 文件为独立的语句
 * 过滤掉注释和空行
 */
function parseSqlStatements(sql: string): string[] {
  // 先移除所有注释行
  const lines = sql.split('\n');
  const cleanedLines = lines.filter((line) => {
    const trimmed = line.trim();
    // 保留非注释行和非空行
    return trimmed && !trimmed.startsWith('--');
  });

  const cleanedSql = cleanedLines.join('\n');

  // 按分号分割语句
  return cleanedSql
    .split(';')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0)
    .map((stmt) => stmt + ';'); // 重新添加分号
}

/**
 * 获取数据库表结构 SQL 语句
 */
export function getSchemaStatements(): string[] {
  const schemaSql = readSqlFile('schema.sql');
  return parseSqlStatements(schemaSql);
}

/**
 * 获取完整的 schema SQL（用于文档或导出）
 */
export function getSchemaSql(): string {
  return readSqlFile('schema.sql');
}

/**
 * SQL 语句分类
 */
export interface SqlStatements {
  tables: string[];
  indexes: string[];
}

/**
 * 获取分类后的 SQL 语句
 */
export function getCategorizedStatements(): SqlStatements {
  const statements = getSchemaStatements();

  return {
    tables: statements.filter((stmt) => stmt.includes('CREATE TABLE')),
    indexes: statements.filter((stmt) => stmt.includes('CREATE INDEX'))
  };
}
