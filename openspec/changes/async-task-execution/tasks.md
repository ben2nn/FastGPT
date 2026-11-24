# Tasks

## 1. 存储层:锁与遗留记录恢复(TaskStorage)

- [x] 1.1 锁 API 重写:`acquireLock(taskId)` 成功返回 `{ lockId, client }` 且不归还连接;`releaseLock(held)` 在同连接 `pg_advisory_unlock` 并校验返回值后 release;验证:单测(mock pool)断言同一 client 获取与解锁、返回值 false 时记录告警
- [x] 1.2 新增 `probeLock(taskId)`:获取→立即释放,返回是否可用;验证:单测覆盖可获取/不可获取两态
- [x] 1.3 新增 `recoverStaleExecutions()`:查 running 记录(按 taskId 去重)→ probeLock 成功则标记 failed("服务重启，执行中断（可重新执行)")→ 失败则跳过;验证:单测断言两种分支与 SQL 参数

## 2. 编排层:TaskManager 异步执行

- [x] 2.1 新增 `startExecution(taskId, params)`:同步段(配置校验→runningTasks 查重→加锁→创建 running 记录)→ 返回 `{ executionId, done }`;验证:单测断言立即返回 executionId 且不等待执行器
- [x] 2.2 后台 runner:重试循环/超时控制/终态写入同一记录(attempts 记入 result.metadata,失败 errorMessage 含尝试次数);finally 释放锁与内存标记;验证:单测覆盖成功、重试成功、重试耗尽失败、超时四态及锁释放在各终态均发生
- [x] 2.3 `executeTask` 改为 await `startExecution(...).done` 的包装;cron 回调同样 await done,409 时记录告警跳过;验证:既有 cron/执行路径单测不回归
- [x] 2.4 执行记录单行化:`executeSingleTask` 不再创建新记录,受理时创建、尝试更新同一条;验证:单测断言一次运行只有一次 createExecution 调用
- [x] 2.5 `initialize()` 末尾调用 `recoverStaleExecutions()`;验证:单测断言初始化后调用了恢复逻辑

## 3. API 路由:202 受理

- [x] 3.1 `[taskId]/execute.ts` 改调 `startExecution`,不 await `done`(挂 catch 记录日志),成功后返回 202 与 success/taskId/executionId/status/message;错误路径(404/409/400/500)语义不变;验证:单测断言 202 结构、不等待执行完成、409/404 不回归
- [x] 3.2 `web/core/task/api.ts` 的 `TaskExecutionResult` 类型更新为 { executionId, status, message };验证:tsc 无新增错误

## 4. 前端:提交后轮询

- [x] 4.1 `ExecuteTaskDialog`:提交成功后进入"已提交(执行 ID x)"状态,每 3s 轮询 `getExecutionDetail(executionId)` 至终态;成功触发 onSuccess,失败展示 errorMessage;可随时关闭(清理定时器,不影响后台);超 10 分钟提示"任务仍在后台执行,可在执行历史查看";验证:tsc 通过 + 人工验证(提交长任务/关闭对话框/查看历史终态)
- [x] 4.2 提交后参数文本框不再冻结,可继续编辑;验证:人工验证

## 5. 文档与集成验证

- [x] 5.1 更新任务模块说明(`src/pages/api/admin/tasks/README.md` 若涉及执行语义)与 `.claude/design/task-async-execution.md` 状态为已确认;验证:文档与实际行为一致
- [ ] 5.2 集成验证(部署/本地实跑):提交长任务确认接口秒级 202、执行历史出现终态;重启服务确认遗留 running 收敛为 failed;模拟锁占用确认 409;验证:接口响应与 task_executions 记录截图/查询结果
  - **部分验证(2026-11-24)**:已在真实 PG 验证会话级 advisory lock 语义(连接A获取→连接B获取 false→A 解锁→B 获取 true),确认 D4 修复方向成立;`task_executions` 当前无 running 遗留行。应用级实跑(需登录态提交长任务)待部署环境执行。

## Workflow follow-up

- 按项目评审要求完成人工复核后,执行 openspec verify / archive 归档本 change。
