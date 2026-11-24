# 任务管理手动执行异步化设计

> 状态：已确认并实现(2026-11-24)｜OpenSpec change: `async-task-execution` ｜ 范围：`projects/admin` 任务模块(K+ 相关不涉及)
> 关联代码：`src/service/core/task/TaskManager.ts`、`TaskStorage.ts`、`src/pages/api/admin/tasks/[taskId]/execute.ts`、`src/pageComponents/tasks/ExecuteTaskDialog.tsx`

## 一、现状与问题

| # | 问题 | 证据 |
|---|---|---|
| 1 | 手动执行同步等待整个任务完成,最长 1 小时(`maxExecutionTime` 默认 3600000ms) | `execute.ts:104` `await taskManager.executeTask(...)`;`TaskManager.ts:374-379` |
| 2 | HTTP 层(Next.js/网关)通常 60s 超时 → 客户端拿到超时错误,但服务端任务可能仍在跑或随中断丢失;前端 `ExecuteTaskDialog` 一直处于"执行中" | `ExecuteTaskDialog.tsx:56-85` |
| 3 | **advisory lock 会话级误用**:锁在借出连接上获取后 `client.release()`,解锁用另一连接 → `pg_advisory_unlock` 无效(返回值未检查),锁实际滞留 | `TaskStorage.ts:465-491, 496-513` |
| 4 | 服务重启后 `task_executions` 中 running 行永远停留在 running;内存 `runningTasks` 清空 | `TaskManager.ts:36`;无恢复逻辑 |
| 5 | 定时触发路径同样串行 await,但 node-cron 回调不阻塞 HTTP,非本次重点 | `TaskManager.ts:196-210` |

## 二、目标 / 非目标

**目标**
- 手动执行接口提交即返回(202 Accepted + executionId),任务在后台执行,结果通过既有执行详情/历史 API 可查
- 并发控制与单任务互斥语义不变(仍在运行则 409)
- 修复 advisory lock 会话级误用,使锁真正覆盖整个执行周期
- 服务重启后遗留 running 记录可收敛(标记失败,可重跑)
- 前端提交后可轮询显示进度与最终结果,允许随时关闭对话框(后台不受影响)
- 保留既有重试与超时机制;无 DDL 变更

**非目标**
- 不引入消息队列/独立 worker 进程(当前部署为常驻 Next.js standalone,进程内后台执行足够)
- 不改变 cron 调度语义与参数解析
- 不实现任务取消(超时 race 不取消底层执行的问题维持现状,记录风险)
- 不改执行历史查询/图表接口

## 三、方案决策

### D1 接口语义:202 + executionId

`POST /api/admin/tasks/:taskId/execute` 成功时返回 `202`:
```json
{ "success": true, "taskId": "data-process", "executionId": 123, "status": "running", "message": "任务已提交执行" }
```
错误语义不变:任务不存在 404、正在运行 409(`TASK_ALREADY_RUNNING`)、参数非法 400、管理器初始化失败 500。参数 JSON 解析仍由前端完成,后端行为不变。

- 备选:返回 200;或 303 跳转 —— 202 最贴合"已受理、未完成"。

### D2 编排拆分:`startExecution`(同步段)+ 后台 runner(异步段)

`TaskManager` 新增:
```
async startExecution(taskId, params): Promise<{ executionId: number; done: Promise<TaskResult> }>
```
- 同步段(请求路径内完成,毫秒级):配置校验 → 内存 `runningTasks` 查重 → **advisory lock(专用连接持有)** → 创建执行记录(status=running) → 加入 runningTasks → 返回 executionId
- 异步段:`removeBackground(donePromise)` 由 API 触发但不 await;runner 内完成重试循环/超时控制/记录终态,finally 释放锁与 runningTasks
- `executeTask` 保留为"await 版本"(cron 与内部调用使用),内部复用 startExecution 并 await done

- 备选:开放式 `void promise` 不捕获 —— 会产生 unhandled rejection;必须挂 catch 并记录日志。

### D3 一次任务运行 = 一条执行记录(重试不再产生新行)

现状每次重试尝试都 `createExecution` 一条(`TaskManager.ts:365-371`)。异步轮询需要稳定主键,改为:
- 提交时创建唯一执行记录(executionId 返回给前端)
- 重试在同一记录内进行:每次尝试覆盖 `errorMessage` 并记录日志;最终成功/失败时写 `endTime/status/result/executionTimeMs`
- 尝试次数写入 `result.metadata.attempts`(成功)与 `errorMessage` 前缀(失败),不改表结构

**BREAKING(历史粒度)**:执行历史由"每尝试一行"变为"每次运行一行"。旧数据不受影响;前端历史列表/图表无结构依赖。

### D4 锁:专用连接持有至执行结束

改 `TaskStorage` API:
- `acquireLock(taskId): Promise<{ lockId: number; client: PoolClient } | null>` —— 成功时**不释放连接**,由调用方持有
- `releaseLock(held: { lockId; client })` —— 在**同一连接**上 `pg_advisory_unlock`,校验返回值后 `client.release()`
- 进程崩溃/连接断开 → 会话锁随连接关闭自动释放(无需额外清理)
- 锁探测(重启恢复用):`probeLock(taskId)` 获取→立即释放,返回是否可用

风险:长任务占用池连接 1 条 —— 池上限 `POSTGRES_MAX_CONNECTIONS`,单任务可接受;并发任务增多时需关注(记录到风险)。

### D5 重启恢复:遗留 running 行收敛

`TaskManager.initialize()` 末尾调用 `TaskStorage.recoverStaleExecutions()`:
1. 查出所有 `status='running'` 的执行记录(按 taskId 分组)
2. 对每条:尝试 `probeLock(taskId)`
   - 获取成功 → 无实例在跑 → `UPDATE` 该行 `status='failed'`, `end_time=now()`, `error_message='服务重启，执行中断（可重新执行）'`, 并释放探测锁
   - 获取失败 → 其他实例/连接仍持有 → 跳过(避免误杀多实例中正在执行的任务)
3. 单实例场景下等价于"重启后立即收敛"

### D6 前端:提交后轮询

`ExecuteTaskDialog`:
- 点击执行 → 调 `executeTask`(接口返回快,不再阻塞 UI)
- 成功后进入"已提交(执行 ID 123)"状态,每 3s 调 `getExecutionDetail(executionId)` 轮询
- 轮询终止条件:status ∈ success/failed;或用户关闭对话框;或超过轮询上限(默认 10 分钟,提示"任务仍在后台执行,可在执行历史查看")
- 成功 → 调用既有 `onSuccess` 回调(列表刷新 isRunning 徽标);失败 → 展示 `errorMessage` 前 N 行
- 关闭按钮随时可用,关闭后后台继续;再次打开对话框可查看历史
- 参数文本框提交后不再冻结(可继续编辑供下次执行)

### D7 定时触发

cron 回调改为 `await startExecution(...).done`(语义同现状,不阻塞 HTTP),异常仅记录日志。

## 四、变更清单

| 文件 | 改动 |
|---|---|
| `TaskStorage.ts` | 锁 API 重写(持有连接);新增 `recoverStaleExecutions` / `probeLock` |
| `TaskManager.ts` | 新增 `startExecution`;`executeTask` 改为 await 包装;执行记录单行化;initialize 末尾恢复遗留记录;`getRunningTasks` 语义保持 |
| `api/admin/tasks/[taskId]/execute.ts` | 改调 `startExecution`,不 await done;202 响应;响应类型增加 executionId/status |
| `web/core/task/api.ts` | `TaskExecutionResult` 类型更新(executionId/status/message) |
| `pageComponents/tasks/ExecuteTaskDialog.tsx` | 提交 + 轮询 + 可随时关闭 |
| 单测 | 见第五节 |

无 DDL、无配置项、无新依赖。

## 五、测试计划

单测(mock storage/pool,沿用 jest mock 风格):
1. `startExecution` 立即返回 executionId,后台 runner 完成时执行记录被更新为 success
2. 后台失败 → 记录 failed + errorMessage;重试 2 次仍失败 → 同一条记录、attempts 正确
3. 任务已在运行 → `TASK_ALREADY_RUNNING`(不创建记录、不重复加锁)
4. 锁获取失败(其他实例) → 409;锁在 runner 结束后被释放(同连接)
5. 超时 → 记录 failed(TASK_TIMEOUT)
6. `recoverStaleExecutions`:可探测锁 → 标记 failed;不可探测 → 保持
7. API 路由:202 结构、404、409、参数非法路径不回归

人工验证:
- 提交长任务后 HTTP 数秒内返回;刷新/关闭页面后台继续;执行历史最终出现终态
- 重启服务后遗留 running 行被标记失败
- 双实例(或手工模拟锁占用)提交同一任务 → 409

## 六、风险 / 回滚

| 风险 | 缓解 |
|---|---|
| 进程重启丢失后台任务 | D5 收敛为 failed 并提示可重跑;任务本身幂等(data-process delete+insert 可重跑) |
| 长任务占用 1 条池连接 | 记录监控;池容量不足时任务并发上限自然收敛(409) |
| 超时不取消底层执行(既有) | 维持现状;后续可评估 executor 注入 AbortSignal |
| 重试历史粒度变化 | 文档+发布说明;历史图表兼容(字段不变) |
| 轮询频繁打到 DB | 3s 间隔 + 仅对话框打开时轮询;细节查询单行,开销可忽略 |

回滚:恢复 `execute.ts` await 版本 + 前端等待逻辑即可;锁修复与恢复逻辑可保留(独立无害)。无数据迁移。
