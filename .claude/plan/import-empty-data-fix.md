# 修复导入数据为空（dataId required 冲突）执行计划

关联设计文档：`.claude/design/import-empty-data-notdata-fix.md`
修复范围：核心修复（用户已确认）——修复点 1 + 2 + 3

## 修复方案（最终确定）

### 修复点 1：改为"插入后清除 dataId"（替代"插入前删除"）

**原方案**（有缺陷）：`insertMany` 前 `delete idx.dataId` → 触发 schema `required: true` 校验失败 → Mongoose 8 `ordered: false` 静默跳过 → 数据丢失。

**新方案**：插入时保留 dataId（通过校验），插入成功后统一 `$unset` 清除源环境向量 dataId：

```ts
await MongoDatasetData.updateMany(
  { _id: { $in: insertedIds } },
  { $unset: { 'indexes.$[].dataId': 1 } }
);
```

- 保留 commit 1a0405b92 的动机：源环境向量 ID（PG BIGSERIAL，跨环境必重复）不残留，防止重建时误删新环境同 ID 向量
- 走 Mongoose 标准插入路径：ObjectId/Date 自动 cast，无脏数据风险（对比 lean 方案）
- `$unset` 必须在创建训练任务之前完成（队列处理依赖 dataId 已被清除）

### 修复点 2：训练任务只针对实际插入成功的数据创建

batchInsert 改为返回插入成功的 `_id` 集合（`Set<string>`），创建训练任务时过滤：

```ts
const trainingData = datas
  .filter((data) => datasIds.has(String(data._id)))
  .map((data) => ({ ... }));
```

### 修复点 3：11000 错误处理适配（使用 Mongoose 特供的 `err.insertedDocs`）

已验证（node_modules/mongoose/lib/model.js:3214-3237）：Mongoose 8 在 driver 写入错误（11000）时会在错误对象上填充 `insertedDocs`（成功插入的文档数组）。batchInsert 的 catch 改为：

```ts
const bulkErr = err as { code?: number; insertedDocs?: unknown[] };
if (bulkErr.code === 11000) {
  const inserted = bulkErr.insertedDocs ?? [];
  inserted.forEach((doc) => insertedIds.add(String((doc as any)._id)));
  duplicateWarnings.push(`${name}: ${batch.length - inserted.length} 条重复已跳过`);
} else {
  throw err;
}
```

## 改动文件

1. `projects/admin/src/pages/api/extend/dataset/importFromJson.ts`
   - 删除"插入前 delete idx.dataId"代码块（约 287-296 行）
   - batchInsert：返回 `Set<string>`、11000 处理用 `err.insertedDocs`
   - datas 插入后批量 `$unset indexes.$[].dataId`
   - 训练任务创建前按 `datasIds` 过滤
   - 响应中 `datasCount` 等改用 `.size`

## 测试（先行）

新增 `test/cases/service/dataset/importDataId.test.ts`（用真实 `MongoDatasetData` schema + 内存 mongo）：

1. **行为锁定**：`insertMany(缺 dataId, { ordered: false })` 静默跳过、不抛错、库 0 条（证明旧方案确实是数据丢失根因）
2. **修复路径**：dataId 保留插入成功 → `$unset indexes.$[].dataId` 后数据在库且 dataId 已清除
3. **11000 处理**：同 _id 批量插入抛错，`err.code === 11000`、`err.insertedDocs` 含成功文档，可恢复成功 _id 集合

## 执行顺序

1. 写测试 → 跑测试（验证 3 个行为假设，测试 1 应失败证明 bug 存在——注：测试 1 锁定的是行为而非断言旧代码，无需红绿切换，跑通即可）
2. 改 importFromJson.ts
3. 跑测试 + `tsc` 类型检查
4. 更新设计文档状态
