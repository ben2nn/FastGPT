# Spec Delta

## Purpose

定义管理后台任务执行的生命周期契约:手动执行异步受理、单任务互斥、执行记录与重试语义、重启后的遗留记录恢复,以及执行状态的可观测性。

## ADDED Requirements

### Requirement: 手动执行异步受理
手动执行接口 SHALL 在完成受理校验后立即返回 `202 Accepted`,响应包含 `success`、`taskId`、`executionId` 与 `status=running`;任务实际执行 MUST 在后台继续,接口响应时间不得受任务执行时长影响。受理前完成的校验保持不变:任务不存在返回 404,任务正在运行返回 409,参数非法返回 400,任务管理器不可用返回 500。

#### Scenario: 提交即返回
- **WHEN** 管理员对存在且未在运行的任务发起手动执行
- **THEN** 接口在任务开始执行后立即返回 202 与 executionId,不等待任务执行完成

#### Scenario: 长任务不阻塞响应
- **WHEN** 被执行的任务耗时远超 HTTP 网关超时阈值(如 10 分钟)
- **THEN** 接口仍立即返回 202,任务在后台继续执行直至终态

#### Scenario: 任务不存在
- **WHEN** 管理员对不存在的任务发起手动执行
- **THEN** 接口返回 404 `TASK_NOT_FOUND`,不创建执行记录

#### Scenario: 支持自定义参数
- **WHEN** 管理员提交执行参数 JSON
- **THEN** 后台执行使用该参数(与默认参数合并规则与升级前一致),executionId 对应本次执行

### Requirement: 单任务互斥
同一任务 SHALL 在同一时刻至多有一个执行实例:本进程内已有执行在进行时返回 409 `TASK_ALREADY_RUNNING`;其他实例持有任务锁时同样返回 409。任务锁 SHALL 在任务执行期间持续有效,并在执行结束(成功、失败或超时)后释放。

#### Scenario: 运行中再次提交被拒绝
- **WHEN** 任务正在执行时管理员再次发起同一任务
- **THEN** 接口返回 409 `TASK_ALREADY_RUNNING`,不创建新执行记录、不启动第二个实例

#### Scenario: 锁覆盖整个执行周期
- **WHEN** 一次任务执行耗时数分钟
- **THEN** 执行期间任务锁始终被持有;其他实例的获取尝试失败并返回 409

#### Scenario: 执行结束后锁被释放
- **WHEN** 任务执行进入终态(成功/失败/超时)
- **THEN** 任务锁被释放,随后可再次提交执行

### Requirement: 一次运行单条执行记录
一次任务运行 SHALL 对应唯一一条 `task_executions` 记录:受理时以 `status=running` 创建,执行结束写入终态与结束时间;执行中的重试 SHALL 在原记录内更新,不得为每次重试创建新记录;重试次数 SHALL 记录在结果或错误信息中。

#### Scenario: 一次运行一条记录
- **WHEN** 一次任务执行经历 2 次重试后成功
- **THEN** 执行历史中该次运行只有一条记录,状态为 success,尝试次数可从结果中读取

#### Scenario: 重试次数用尽失败
- **WHEN** 任务重试次数用尽仍失败
- **THEN** 该记录状态为 failed,errorMessage 包含尝试次数与最后错误

#### Scenario: 执行超时
- **WHEN** 任务执行超过配置的最大执行时间
- **THEN** 该记录状态为 failed 且错误类型为任务超时,结束时间被写入

### Requirement: 重启后的遗留记录恢复
服务启动时 SHALL 检查处于 `running` 状态的执行记录:若对应任务锁可获取(无任何实例正在执行),MUST 将该记录标记为 failed 并注明"服务重启导致执行中断、可重新执行";若锁不可获取(其他实例仍在执行),MUST 保留原状态不做改动。

#### Scenario: 单实例重启收敛
- **WHEN** 服务在执行过程中重启,重启后初始化完成
- **THEN** 遗留的 running 记录被标记为 failed 并带有可重跑提示

#### Scenario: 多实例不误杀
- **WHEN** 另一实例正持有某任务锁执行中,本实例启动
- **THEN** 该任务的 running 记录保持不变

### Requirement: 执行状态可观测
执行进行中 SHALL 可通过执行详情接口看到 `running` 状态;结束后 SHALL 可看到终态、结束时间、耗时与结果或错误信息;任务列表的 `isRunning` 标记 SHALL 在执行期间为真、结束后为假。

#### Scenario: 执行中查询状态
- **WHEN** 任务执行期间查询执行详情
- **THEN** 返回 status=running 与开始时间

#### Scenario: 结束后查询终态
- **WHEN** 任务执行完成后查询执行详情或执行历史
- **THEN** 返回 status、endTime、executionTimeMs 与 result/errorMessage

#### Scenario: 列表运行标记
- **WHEN** 任务执行期间查询任务列表
- **THEN** 该任务项 isRunning=true;执行结束后再次查询为 false

### Requirement: 定时触发沿用同一编排
cron 定时触发 SHALL 复用与手动执行相同的编排(受理校验、互斥、记录、重试与终态);触发时若该任务仍在执行,SHALL 跳过本次触发并记录告警,不得排队或并发执行。

#### Scenario: 定时触发正常执行
- **WHEN** cron 到点触发且任务未在运行
- **THEN** 任务按默认参数执行并产生一条执行记录

#### Scenario: 上次未结束则跳过
- **WHEN** cron 到点触发但任务仍在执行
- **THEN** 本次触发被跳过并记录告警,不产生新执行实例
