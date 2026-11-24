# 数据提取任务在 MongoDB 断连中断的韧性修复设计

> 日期: 2026-11-24
> 触发日志: admin `data-process` 任务（`dataCapCollect.extractCallLogs`）在 getMore 阶段被中断
> 关联: [[mongo-keepalive-reconnect-fix]]、[[mongo-query-wait-reconnect]]、[[datacap-collect-response-migration]]

## 1. 现象

```
[Warn]  MongoDB 连接断开，启动自动重连
[Info]  尝试重连 MongoDB (1/5)
MongoDB start connect
[Error] 批次数据提取失败 - lastId: 695a0f45c0cb3c7781b55a1e, limit: 1000
[Error] 数据提取失败 - 统计: {"totalRecords":0,"successRecords":0,"failedRecords":0,"executionTime":12733}
MongoServerError: Executor error during getMore :: caused by :: operation was interrupted
  at AggregationCursor.next (abstract_cursor.js)
[Error] 数据处理任务执行失败
```

失败点在 `collect.ts` 的 `MongoChatItem.aggregate(pipeline).exec()`（[collect.ts:692](../../projects/admin/src/service/core/datacap/collect.ts)），
`lastId` 是本批**起始游标**（上一批最后一条 AI 消息的 `_id`），说明前若干批已扫描完成，
在拉取本批聚合结果的后续 `getMore` 时连接断开、服务端中断了游标。

## 2. 时间线解读

| 事件 | 含义 |
|---|---|
| `MongoDB 连接断开，启动自动重连` | driver 感知到连接丢失（网络瞬断、mongod 重启/stepdown、或 mongod 进程退出） |
| `尝试重连 MongoDB (1/5)` | `mongoWatch.handleReconnect` 首次立即重连（设计如此） |
| `getMore ... operation was interrupted` | 聚合游标已在服务端执行中，连接丢失后服务端中止了该操作 |
| `executionTime: 12733` | 该批聚合已运行约 12.7 秒，返回了一批（默认 batchSize 101）后继续 getMore 时失败 |

关键点：**是"连接断开"导致 getMore 失败，而不是慢查询导致断开**（日志顺序为断开在前）。
但 12.7 秒的批处理时间说明聚合本身很重，需排查它是否触发了 mongod 侧的 OOM / 重启（见 §6）。

## 3. 根因

### 3.1 直接原因：cursor 操作不可重试，且应用层没有批次级重试

- MongoDB driver 的 `retryReads` 只对 `find` / `aggregate` 的**首个命令**有效，
  `getMore` 是 cursor 续拉操作，服务端游标状态与连接绑定，driver **不会**自动重试。
- 共享层 `addCommonMiddleware` 注册的 `waitForMongoReady` pre-hook（[index.ts:47](../../packages/service/common/mongo/index.ts)
  与 [waitForReady.ts](../../packages/service/common/mongo/waitForReady.ts)）只在**操作开始前**检查连接，
  对一个已经开始、正在 getMore 的聚合完全无效。
- `DataCapCollect.extractBatch` 的 catch 只记录日志后 `throw`，没有任何重试；
  一次 getMore 失败 → 整批作废 → `extractCallLogs` 抛出 → 整个任务本次执行失败。

### 3.2 放大因素一：一次失败丢弃全部已提取批次

`extractCallLogs` 把每一批结果累积在内存 `allLogs`，最后才返回给
`dataProcessExecutor` 一次性 `batchInsertLogs`。所以失败时：

1. 已成功提取的前 N-1 批结果全部丢弃（`stats.totalRecords` 也是 0，见 §3.5）；
2. 任务级重试（`retryCount: 3`、间隔 60s，[taskConfigs.ts:32](../../projects/admin/src/service/core/task/taskConfigs.ts)）
   每次都从 `lastId = null` 全量重跑，负载 ×3。

### 3.3 放大因素二：提取前先清空 PG 数据

`dataProcessExecutor` 第 2 步即 `deleteByTimeRange(startDate, endDate)`（[taskExecutors.ts:32](../../projects/admin/src/service/core/task/taskExecutors.ts)），
然后才提取。提取失败时，该时间区间在 `model_call_logs` 里是**空的**：
统计报表直接空窗，直到某次重试成功。若 Mongo 故障超过 3 次重试（约 3 分钟），
该天的统计数据全部丢失，需人工重跑。

### 3.4 放大因素三：单批聚合的内存与游标寿命过大

- `batchSize` 默认 1000 条 **AI 消息**，每条消息经 `$lookup chat_item_responses` +
  `$unwind responseData` 可展开为多条响应文档；
- `$lookup apps` 与 `$lookup app_versions` **未做字段裁剪**：整个 app 文档（含草稿
  `modules`）和整个版本文件（含完整工作流 `nodes`）被复制进每一条展开后的文档；
- 1000 条消息 × 多条响应 × 整份 app/version 文档 → 单次聚合的中间结果可达数百 MB，
  cursor 存活时间长，暴露在断连窗口下的概率同比上升。

### 3.5 可观测性缺陷

`this.stats.totalRecords` 只在全部成功后赋值（[collect.ts:119](../../projects/admin/src/service/core/datacap/collect.ts)），
失败时恒为 0，无法判断此前已处理多少数据，误导排查（本次日志即如此）。

### 3.6 PG 批量插入不分片，超出协议参数上限

2026-11-24 16:03 提取成功 420,440 条后在插入阶段失败：

```
[Info] 开始批量插入 420440 条记录
[Error] 批量插入失败，事务已回滚: bind message has 58504 parameter formats but 0 parameters
[Info] 尝试逐条插入以识别问题记录
```

`batchInsertLogs` 为全部记录生成**单条 INSERT**，每行 19 个列参数
（[storage.ts:48-93](../../projects/admin/src/service/core/datacap/storage.ts)）：

- 参数总数 = 420,440 × 19 = 7,988,360；
- PostgreSQL wire protocol 的 Bind 消息中参数个数是 **Int16，上限 65,535**；
- 7,988,360 mod 65,536 = **58,504**，与报错数字完全吻合 —— 协议字段回绕，
  服务端收到的参数格式数与实际参数个数不一致，直接拒绝。

放大因素：

1. 失败后进入 `fallbackInsertOneByOne`，在**同一事务内逐条**插入 42 万条
   （[storage.ts:128-217](../../projects/admin/src/service/core/datacap/storage.ts)），
   每条一次 roundtrip，预计 7~15 分钟，叠加前面的 6.8 分钟提取，
   很可能撞上任务 1 小时超时（`maxExecutionTime: 3600000`）；
2. `RETURNING call_id` / `RETURNING id` 让服务端为 42 万行构造返回结果集，
   而代码只使用 `rowCount`，纯属浪费内存与带宽；
3. 单事务写入 42 万行会把整段 WAL 压在内存/磁盘，失败重试时又整段重来。

## 4. 修复方案

### P0：批次级重试（治本，必做）

在 `collect.ts` 内对**每个批次**做连接类错误的重试，利用 `_id` 游标分页的幂等性：
本批未完成则用同一 `lastId` 重跑，已完成的批次不受影响。

实现要点：

1. 新增错误判定函数 `isRetryableMongoError(err)`，覆盖：
   - `err.name`: `MongoNetworkError` / `MongoNetworkTimeoutError` / `MongoNotConnectedError` /
     `MongoServerSelectionError` / `MongoTopologyClosedError`
   - `err.code`: `11600` (InterruptedAtShutdown)、`11602` (InterruptedDueToReplStateChange)、
     `11601` (Interrupted)、`6` (HostUnreachable)、`89` (NetworkTimeout)、`91` (ShutdownInProgress)
   - message 含 `operation was interrupted` / `connection ... closed` / `topology is closed`
2. `extractBatch` 外层包一层 `withBatchRetry`：
   ```
   for attempt in 0..maxAttempts:
     try: return await extractBatch(...)
     catch err:
       if !isRetryableMongoError(err) || attempt === maxAttempts: throw
       等 waitForMongoReady(connectionMongo.connection, 30000)  // 30s 内等重连
       指数退避 1s → 2s → 4s → 8s
   ```
   默认 `maxAttempts = 5`，可用 `EXTRACTION_BATCH_RETRY` 环境变量覆盖。
   超时仍不恢复则抛出，交给任务级重试——但此时不会因一次瞬断就整任务失败。
3. 注意：`waitForMongoReady` 返回 false 时不要立刻重试，先退避再判连接。

### P0-2：批量插入按参数上限分片（本次事故的直接修复）

在 `batchInsertLogs` 内部按参数数分片，调用方（`taskExecutors`）无需改动：

1. 常量：`const COLS = 19; const MAX_PARAMS = 65535;`
   `const CHUNK_SIZE = Math.floor(MAX_PARAMS / COLS) - 500` → 取 **3000 行/片**
   （3000 × 19 = 57,000，留 ~5,500 参数余量）。
2. 循环切片，每片执行一次现有写法的 INSERT，累计
   `successCount` / `duplicateCount`；`failedCount` 只在兜底路径累加。
3. **去掉 `RETURNING call_id`**：`rowCount` 即冲突后实际插入行数，不需要回传列。
   42 万行 × call_id 的返传结果集是纯开销。
4. 事务粒度：**每片一个事务**（BEGIN/COMMIT），失败只回滚该片，
   配合 `ON CONFLICT (call_id) DO NOTHING` 幂等，重试安全；
   单片失败时对该片做一次逐条兜底（最多 3000 条，而非 42 万条）。
5. `fallbackInsertOneByOne` 去 `RETURNING id`，并增加单条插入的失败样本上限
   （`errors` 数组最多保留 100 条，避免 42 万条错误对象撑爆内存）。
6. 日志分片进度：每完成一片输出
   `插入进度 chunk i/N，成功 X，重复 Y`，便于判断是否接近超时。

选用"分片 + 现有 VALUES 写法"而不是 `INSERT ... SELECT FROM unnest($1::text[], ...)`
的原因：后者只有 19 个参数、更大单次数能更大，但需要为 19 个数组显式声明并转换
PG 类型（timestamp/数值/可空），而 `ModelCallLog` 的字段类型与表结构存在多处
`|| null` 兜底，类型转换写错的概率更高；分片方案零语义变更，风险最低。

### P1：失败不丢已提取批次 + 不清空 PG 数据

1. **`deleteByTimeRange` 后移**：从 `dataProcessExecutor` 第 2 步移到提取（及插入）成功之后，
   或者改成"先提取，成功后在同一流程里删除再插入"。最小改动：
   - `dataProcessExecutor` 里去掉开头删除；
   - 提取成功后、插入前删除，或者干脆保留增量语义、只用 `ON CONFLICT DO NOTHING`。
   取舍：删除后移会让本区间内旧记录在新数据写入前短暂缺失（秒级），可接受；
   提取失败时旧数据完整保留。
2. **分批落库（可选，取决于单日数据量）**：把 `extractCallLogs` 改为按批回调
   （`onBatch(logs)`）或异步生成器，`dataProcessExecutor` 每批直接 `batchInsertLogs`。
   配合 `ON CONFLICT (call_id) DO NOTHING` 天然幂等，重试不会重复写入，内存也降为单批大小。
   若采用此方案，需要在 §4.1 的"删除旧数据"语义上额外定义（避免删掉本批已写入的行）：
   - 方案 A（推荐，改动小）：仍全量提取 → 先删区间 → 插入，仅把删除从"提取前"挪到"提取后"；
   - 方案 B（彻底，需加列）：`model_call_logs` 增加 `batch_run_id`，每批写入带本次运行 ID，
     全部成功后 `DELETE ... WHERE call_timestamp BETWEEN $1 AND $2 AND batch_run_id IS DISTINCT FROM $runId`。

### P1：减小单批聚合开销

1. **已实现**：在 `$unwind` 之前用 `$addFields + $map` 裁剪 `appInfo`（只留 `name`）
   与 `appVersionInfo`（只留 `nodes`），避免整份应用/版本文档被复制到每条节点响应。
   未采用 `$lookup` 的 `pipeline + $project` 写法：部署允许降级到 MongoDB 4.4
   （见 `deploy/docker/cn/docker-compose.pg.yml` 的注释），而 4.4 不支持
   `localField`/`foreignField` 与 `pipeline` 组合，会在线上直接报错。
2. **已实现**：`aggregate()` 增加 `.option({ allowDiskUse: true })`（对 `$lookup` 内存帮助有限，但可减少 `$sort` 阻塞）。
3. 默认 `batchSize` 从 1000 降到 200（`EXTRACTION_BATCH_SIZE` 已支持环境变量，
   先在生产配置 200 验证，再考虑改默认值）。批次数增加，但单次游标寿命与内存线性下降。
   **未改默认值，留待线上观察**。

### P2：可观测性修正

每批成功后立即更新 `this.stats.totalRecords`，使失败日志能反映已处理进度；
失败日志中追加 `batchNumber` 与 `lastId`（已有）以及判定为可重试/不可重试。

### P2：待确认项（非代码）

1. **MongoDB 侧**：检查 mongod 日志对应时间点是否有 shutdown / restart / stepdown / OOM killer。
   若为 mongod 重启，需要确认是否与重型聚合的内存占用有关（与 P1 联动）。
2. **`_id` 与 `time` 不一致**：本次 `lastId = 695a0f45c0cb3c7781b55a1e`，
   其 ObjectId 时间戳约为 2026-01-04（UTC）。若任务处理的是近期窗口，
   说明该集合数据经过导入/回填，`_id` 时间与 `time` 不同步。
   **在此结论确认前，不要采用"用 ObjectId 时间边界裁剪扫描范围"的索引优化**，否则会漏数据。
3. **分页查询索引**：当前查询 `{ obj: 'AI', time: {...}, _id: {$gt} }` + `sort _id`
   只能沿 `_id` 索引扫描并逐条过滤 `obj/time`，当天集合越大首批越慢。
   可在确认 §6.2 后评估新增 `{ obj: 1, _id: 1 }` 索引或改用时间边界。

## 5. 测试设计

在 `projects/admin/src/service/core/datacap/__tests__/collect.test.ts` 基础上扩展
（现有测试已 mock `MongoChatItem.find/aggregate`）：

1. **断连重试成功**：`aggregate().exec()` 第一次抛
   `{ name: 'MongoNetworkError', message: 'connection closed' }`，第二次返回正常结果；
   断言最终成功、`lastId` 游标只前进一次、批次未被重复计入。
2. **不可重试错误直抛**：抛 `TypeError` → 立即抛出，不进入重试（避免把代码 bug 当断连）。
3. **重试耗尽**：连续 5 次抛连接错误 → 抛出 `SystemError(DATA_CAP_ERROR)`，
   日志中含批次号与进度。
4. **幂等性**：两批数据、第二批第一次失败 → 断言第一批结果保留、第二批只重跑一次。
5. **删除时机**（若采用 P1 方案 A）：`dataProcessExecutor` 在提取抛错时**不**调用
   `deleteByTimeRange`。
6. **插入分片**（P0-2）：
   - 构造 10,000 条 `ModelCallLog`，mock `client.query` 记录每次调用的参数个数，
     断言每次 ≤ 65,535、分片次数 = ⌈10000 / 3000⌉、累计 `successCount` 正确；
   - 某一片抛错 → 断言只有该片回滚并走单片兜底，其余片结果保留；
   - 断言最终 SQL 不再包含 `RETURNING`。

新增测试需注意：现有测试用 jest mock，`waitForMongoReady` 需 mock 为立即可用，
退避 `delay` 用 fake timers 或 mock 掉，避免真实等待。

## 6. 不改动项

- `handleReconnect` 的重连策略（首次立即、5 次、指数退避）不变；
- `waitForMongoReady` pre-hook 及其 5s 超时不变（它覆盖的是"操作开始前"的窗口）；
- `batchInsertLogs` 的 `ON CONFLICT DO NOTHING` 语义不变（幂等基础）；
- 连接池参数不变。

## 7. 实施顺序建议

1. **P0-2 批量插入分片**（改 `storage.ts` 单文件）：这是 42 万条量级的**必现失败**，
   与断连无关，重试多少次都会撞同一上限，优先级最高；
2. **P0-1 批次重试 + P2 stats 修正**（改 `collect.ts` 单文件，风险最低）；
3. **P1-1 删除时机后移**（改 `taskExecutors.ts`，单独提交，便于回滚）；
4. **P1-2 聚合字段裁剪 + `batchSize` 配置降至 200**（线上观察一次全量任务耗时与内存）；
5. **P1-3 分批落库**（视 §3.4 观察结果决定是否需要，改动面最大，最后做）。

## 8. 本次事故的即时处置

1. 确认 16:03 那次任务是否在 `fallbackInsertOneByOne` 中跑完：
   - 完成 → 数据完整，仅耗时异常，可只做 P0-2；
   - 超时/失败 → `model_call_logs` 对应区间为空（提取前已删除），
     必须修复 P0-2 后重跑，重跑前不要再次触发任务（重试会把同一区间再删一遍）。
2. 若需人工立即恢复统计，可临时把 `batchSize` 调小（如 200）让单次提取结果降到
   6 万条以下——但一天 42 万条的总量不变，插入仍走同一条 SQL，**这不解决参数上限问题**，
   只会让批次失败点前移。真正可用的临时手段是把 `model_call_logs` 区间数据按
   `call_timestamp` 手工分段导入，或直接等 P0-2 上线。

## 9. 实施状态（2026-11-24）

| 项 | 文件 | 内容 |
|---|---|---|
| P0-2 | `datacap/storage.ts` | 3000 行/片分片插入；每片独立事务；去掉 `RETURNING`；兜底只对失败片；错误样本上限 100 |
| P0-1 | `datacap/collect.ts` | `extractBatchWithRetry`：按 error name / code / message 判定连接类错误，用同一 `lastId` 重试，默认最多 5 次；先等重连（30s）再指数退避（1/2/4/8s） |
| P2 | `datacap/collect.ts` | 每批成功后更新 stats，失败日志能反映已处理进度 |
| P1-1 | `task/taskExecutors.ts` | 提取成功后才 `deleteByTimeRange`；提取失败保留旧数据 |
| P1-2 | `datacap/collect.ts` | `$unwind` 前用 `$map` 裁剪 `appInfo`/`appVersionInfo`；`allowDiskUse: true` |

测试：

- `__tests__/collect.test.ts` 新增 4 个用例：连接中断重试成功、非连接错误不重试、
  连接持续不可用重试耗尽、失败时 stats 反映已处理批次；原有 18 个用例保持通过；
- 新增 `__tests__/storage.test.ts` 5 个用例：分片参数数 ≤ 65535、无 `RETURNING`、
  单片失败只兜底该片、错误样本上限、空输入不建连接；
- 合计 **22/22 通过**；`tsc --noEmit` 中改动文件无错误（其余 43 个为既有问题）；
  ESLint 改动文件 0 问题。

回滚：三个文件彼此独立，可按文件单独回退。分片粒度 `INSERT_CHUNK_ROWS` 与重试次数
`EXTRACTION_BATCH_MAX_ATTEMPTS`（环境变量）均可独立调整。

上线后验证：

1. 手动触发 `data-process`，确认日志出现 `分 N 片`、`插入进度`，最终 `失败 0`；
2. 观察提取阶段是否出现 `批次 N 提取失败（连接类错误），准备第 x/4 次重试`；
3. 核对 `model_call_logs` 当天条数与提取日志的 `extractedCount` 一致。


