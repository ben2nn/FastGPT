/**
 * 诊断脚本：定位 "训练异常 column "undefined" does not exist" 的来源
 *
 * 功能：
 * 1. 查询 dataset_trainings 中 errorMsg 包含 "undefined" 的记录（含时间戳，判断历史遗留 vs 当前发生）
 * 2. 对有 dataId 的记录，输出对应 dataset_datas 的 indexes 结构（检查 text/dataId 是否缺失）
 *
 * 运行方式：node test/cases/service/mongo/diagnose-training-error.cjs
 */
const { MongoClient } = require('mongodb');
const { readFileSync } = require('fs');
const { resolve } = require('path');

async function loadEnv() {
  const env = {};
  const content = readFileSync(resolve(__dirname, '../../../../projects/admin/.env'), 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !m[1].startsWith('#')) env[m[1]] = m[2].trim();
  }
  return env;
}

function oidTime(oid) {
  return new Date(parseInt(oid.toString().substring(0, 8), 16) * 1000).toISOString();
}

async function main() {
  const env = await loadEnv();
  const url = env.MONGODB_URI;
  if (!url) {
    console.error('MONGODB_URI 未在 projects/admin/.env 中配置');
    process.exit(1);
  }

  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();

  // 1. 查询错误记录
  const errors = await db
    .collection('dataset_trainings')
    .find({ errorMsg: { $regex: /undefined/ } })
    .sort({ _id: -1 })
    .limit(10)
    .toArray();

  console.log(`\n=== dataset_trainings 中 errorMsg 含 "undefined" 的记录: ${errors.length} 条(显示最新 10 条) ===\n`);

  for (const t of errors) {
    console.log(`- _id: ${t._id} (创建于 ${oidTime(t._id)})`);
    console.log(`  mode: ${t.mode}, datasetId: ${t.datasetId}, collectionId: ${t.collectionId}`);
    console.log(`  dataId: ${t.dataId || '(无)'}, retryCount: ${t.retryCount}, lockTime: ${t.lockTime || '(无)'}`);
    console.log(`  errorMsg: ${String(t.errorMsg).slice(0, 300)}`);

    // 2. 查对应数据的 indexes 结构
    if (t.dataId) {
      const data = await db.collection('dataset_datas').findOne(
        { _id: t.dataId },
        { projection: { indexes: 1, q: 1 } }
      );
      if (data) {
        const badIndexes = (data.indexes || []).filter((idx) => !idx || typeof idx.text !== 'string' || idx.text.length === 0);
        console.log(`  dataset_datas.indexes: ${(data.indexes || []).length} 个,异常项 ${badIndexes.length} 个`);
        for (const idx of badIndexes.slice(0, 3)) {
          console.log(`    异常 index: ${JSON.stringify(idx).slice(0, 200)}`);
        }
      } else {
        console.log('  dataset_datas 中未找到对应数据(已删除)');
      }
    }
    console.log('');
  }

  // 3. 时间分布统计:按天统计错误记录数,判断是否仍在发生
  const agg = await db
    .collection('dataset_trainings')
    .aggregate([
      { $match: { errorMsg: { $exists: true } } },
      {
        $group: {
          _id: { $toDate: { $multiply: [{ $toLong: '$_id' }, 1] } },
          count: { $sum: 1 }
        }
      }
    ])
    .toArray();

  console.log('=== 所有 errorMsg 记录按天分布(判断错误是否持续发生) ===');
  const byDay = {};
  for (const item of agg) {
    // 简化:直接输出所有分组(数据量不大)
    const day = item._id ? item._id.toISOString().slice(0, 10) : 'unknown';
    byDay[day] = (byDay[day] || 0) + item.count;
  }
  for (const [day, count] of Object.entries(byDay).sort()) {
    console.log(`  ${day}: ${count} 条`);
  }

  await client.close();
}

main().catch((err) => {
  console.error('诊断脚本执行失败:', err);
  process.exit(1);
});
