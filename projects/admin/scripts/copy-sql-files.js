/**
 * 复制 SQL 文件到构建输出目录
 * 确保在生产环境中可以访问 SQL 文件
 */

const fs = require('fs');
const path = require('path');

const sqlSourceDir = path.join(__dirname, '../src/service/sql');
const sqlTargetDir = path.join(__dirname, '../.next/server/src/service/sql');

console.log('开始复制 SQL 文件...');
console.log('源目录:', sqlSourceDir);
console.log('目标目录:', sqlTargetDir);

// 确保目标目录存在
if (!fs.existsSync(sqlTargetDir)) {
  fs.mkdirSync(sqlTargetDir, { recursive: true });
  console.log('创建目标目录:', sqlTargetDir);
}

// 读取源目录中的所有文件
const files = fs.readdirSync(sqlSourceDir);

// 复制所有 .sql 文件
let copiedCount = 0;
files.forEach((file) => {
  if (file.endsWith('.sql')) {
    const sourcePath = path.join(sqlSourceDir, file);
    const targetPath = path.join(sqlTargetDir, file);

    fs.copyFileSync(sourcePath, targetPath);
    console.log(`已复制: ${file}`);
    copiedCount++;
  }
});

console.log(`SQL 文件复制完成，共复制 ${copiedCount} 个文件`);
