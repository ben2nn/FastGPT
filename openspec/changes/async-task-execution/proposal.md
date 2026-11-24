# Proposal

## Why

管理后台的手动任务执行是同步阻塞的:接口 `await` 整个任务(最长 `maxExecutionTime` 默认 1 小时),而 HTTP 层通常在 60 秒内超时,导致前端长时间"执行中"、客户端拿到超时错误、服务端执行结果丢失;同时并发锁使用会话级 advisory lock 却借出即归还连接,锁语义失效,服务重启后执行记录永久停留在 running。需要将手动执行改为"提交即返回、后台执行、状态可查"的异步模式。

## What Changes

- **接口语义**:`POST /api/admin/tasks/:taskId/execute` 提交即返回 `202 Accepted` 与 `executionId`、`status=running`;404/409/400 错误语义不变
- **执行编排**:新增同步的"受理段"(校验、查重、加锁、建执行记录)与后台 runner(重试、超时、终态写入),runner 不阻塞请求
- **BREAKING(执行历史粒度)**:一次任务运行对应一条执行记录;重试在同一记录内更新,不再每次尝试一行(旧数据不受影响)
- **并发锁修复**:advisory lock 改为专用连接持有至执行结束、同连接解锁;锁获取失败(其他实例运行中)仍返回 409
- **重启恢复**:服务启动时探测遗留 `running` 记录,无实例在跑则标记失败并提示可重跑,有其他实例持有锁则跳过
- **前端**:手动执行对话框提交后轮询执行详情(间隔 3 秒)显示终态,可随时关闭且不影响后台执行
- **定时触发**:cron 路径复用同一编排,对外语义不变

## Capabilities

### New Capabilities

- `task-execution`: 任务执行的生命周期契约——异步受理(202)、单任务互斥(409 与锁持有)、一次运行单条执行记录与重试语义、超时与终态、重启后的遗留记录恢复、执行状态可查。

### Modified Capabilities

(无现有能力的需求变更)

## Impact

- **代码**(均在 `projects/admin`):
  - `src/service/core/task/TaskManager.ts`:`startExecution` 同步段 + 后台 runner,`executeTask` 改为 await 包装,执行记录单行化,initialize 末尾恢复遗留记录
  - `src/service/core/task/TaskStorage.ts`:锁 API 重写(持有连接解锁)、`probeLock`、`recoverStaleExecutions`
  - `src/pages/api/admin/tasks/[taskId]/execute.ts`:202 响应,不 await runner
  - `src/web/core/task/api.ts`:执行结果类型更新
  - `src/pageComponents/tasks/ExecuteTaskDialog.tsx`:轮询与可关闭
- **数据库**:无 DDL 变更(沿用 `task_executions`);无数据迁移
- **部署**:后台任务与 admin 进程生命周期绑定;重启会中断执行并由恢复逻辑标记失败(任务本身幂等,可重跑)
- **测试**:TaskManager 编排/并发/恢复单测、execute API 路由单测;前端轮询为人工验证
- **设计文档**:`.claude/design/task-async-execution.md`
