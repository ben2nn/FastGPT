/**
 * SQL Schema 内容
 * 在构建时自动生成，包含 schema.sql 的内容
 * 这样可以避免在生产环境中读取文件系统
 */

import { readFileSync } from 'fs';
import { join } from 'path';

let cachedSchemaContent: string | null = null;

/**
 * 获取 schema SQL 内容
 * 优先使用缓存，避免重复读取文件
 */
export function getSchemaContent(): string {
  if (cachedSchemaContent) {
    return cachedSchemaContent;
  }

  // 尝试多个可能的路径
  const possiblePaths = [
    // 开发环境：直接从源码目录读取
    join(__dirname, 'schema.sql'),
    // 生产环境：从项目根目录读取
    join(process.cwd(), 'src', 'service', 'sql', 'schema.sql'),
    // 备用路径：相对于 admin 项目根目录
    join(process.cwd(), 'projects', 'admin', 'src', 'service', 'sql', 'schema.sql'),
    // 额外的备用路径：从 .next 目录读取（构建后复制的文件）
    join(process.cwd(), '.next', 'server', 'src', 'service', 'sql', 'schema.sql')
  ];

  let lastError: Error | null = null;

  for (const filePath of possiblePaths) {
    try {
      cachedSchemaContent = readFileSync(filePath, 'utf-8');
      // 成功读取后记录日志（仅在开发环境）
      if (process.env.NODE_ENV === 'development') {
        console.log(`[SQL] 成功从以下路径加载 schema.sql: ${filePath}`);
      }
      return cachedSchemaContent;
    } catch (error) {
      lastError = error as Error;
      // 继续尝试下一个路径
      continue;
    }
  }

  // 所有路径都失败，抛出详细错误
  throw new Error(
    `无法找到 schema.sql 文件\n` +
      `尝试的路径:\n${possiblePaths.map((p) => `  - ${p}`).join('\n')}\n` +
      `当前工作目录: ${process.cwd()}\n` +
      `__dirname: ${__dirname}\n` +
      `最后的错误: ${lastError?.message || '未知错误'}`
  );
}
