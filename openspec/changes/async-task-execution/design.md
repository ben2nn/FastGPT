# Design

## Context

详见 proposal.md 与 `.claude/design/task-async-execution.md`(完整设计草案)。现状要点:

- 手动执行同步 await,最长 1 小时;HTTP 网关 60s 超时;
- 并发控制 = 内存 `runningTasks` + PG advisory lock,但锁在借出连接上获取后立即归还,会话级锁实际滞留/失效(`TaskStorage.ts:465-491`);
- `task_executions` 已有 running/success/failed 状态与详情/历史 API;服务重启无遗留记录收敛;
- admin 为常驻 Next.js standalone 进程,进程内后台执行可行。

## Goals / Non-Goals

**Goals:** 异步受理(202);锁语义修正并覆盖整个执行周期;一次运行单条执行记录;重启恢复;前端轮询可关闭;无 DDL、无新依赖。

**Non-Goals:** 消息队列/独立 worker;任务取消(超时 race 不取消底层执行维持现状);cron 调度与参数解析变更;历史图表接口变更。

## Decisions

### D1 受理与执行分段
`TaskManager.startExecution(taskId, params)` 返回 `{ executionId, done: Promise<TaskResult> }`:
- 同步段:配置校验 → `runningTasks` 查重 → 加锁(专用连接)→ 创建执行记录(running)→ 返回;
- 异步段:API 以 `void done.catch(log)` 分离,不 await;runner 内执行重试循环、超时控制、终态写入,finally 释放锁与内存标记。
- 备选:裸 `void promise` 无 catch(拒绝);await 后返回(回到现状)。

### D2 锁持有连接
`acquireLock` 成功时返回 `{ lockId, client }` 且不归还连接;`releaseLock(held)` 在同连接 `pg_advisory_unlock` 并校验返回值后 release;新增 `probeLock`(获取即释放)供恢复逻辑使用。进程崩溃时连接关闭自动解锁。

### D3 执行记录单行化
受理时创建唯一记录;重试在同一行更新(attempts 记入 `result.metadata.attempts`,失败时 errorMessage 前缀尝试次数)。**BREAKING(历史粒度)**:原每尝试一行 → 每次运行一行。旧数据不受影响。

### D4 重启恢复
`initialize()` 末尾:对每条 running 记录按 taskId 去重后 `probeLock`;可获取 → 标记 failed("服务重启，执行中断（可重新执行)")并释放;不可获取 → 跳过(多实例防误杀)。

### D5 前端轮询
对话框提交后每 3s 轮询 `getExecutionDetail`;终态或用户关闭或超 10 分钟停止(超时提示任务仍在后台);成功触发既有 onSuccess。参数框提交后不再冻结。

### D6 cron 沿用
cron 回调 `await startExecution(...).done`;运行中触发返回 409 → 记录告警并跳过(与现状一致)。

## Risks / Trade-offs

- [进程重启中断后台任务] → D4 标记 failed 且任务幂等可重跑
- [长任务占用 1 条池连接] → 单任务可接受;并发上限由 409 自然收敛,记录监控项
- [超时不取消底层执行(既有)] → 不改;后续可评估 AbortSignal
- [历史粒度变化] → 发布说明;前端字段无结构依赖
- [轮询开销] → 3s 间隔、仅对话框打开时轮询、单行查询

## Migration Plan

1. 发布新版本(无 DDL):服务启动即执行遗留 running 记录恢复;
2. 验证:提交长任务观察 202 与轮询终态;重启服务观察遗留记录收敛;模拟锁占用观察 409;
3. 回滚:恢复接口同步 await 与前端等待逻辑;锁修复与恢复逻辑可保留(独立无害);无数据迁移。
