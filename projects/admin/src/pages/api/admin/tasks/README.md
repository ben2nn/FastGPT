# 任务管理 API 文档

本文档描述了任务管理系统的 RESTful API 接口。

## 基础信息

- **基础路径**: `/api/admin/tasks`
- **权限要求**: 所有接口需要管理员权限（TODO: 待实现）
- **响应格式**: JSON

## API 接口列表

### 1. 获取任务列表

获取所有任务配置列表，包含每个任务的下次执行时间和最近执行状态。

**请求**:
```
GET /api/admin/tasks/list
```

**响应**:
```json
{
  "tasks": [
    {
      "id": "data-process",
      "name": "数据处理任务",
      "description": "处理前一天的数据，生成统计报告",
      "cronExpression": "0 2 * * *",
      "timezone": "Asia/Shanghai",
      "enabled": true,
      "executorName": "dataProcessExecutor",
      "defaultParams": {
        "startTime": "{{yesterday.start}}",
        "endTime": "{{yesterday.end}}",
        "batchSize": 1000
      },
      "maxExecutionTime": 3600000,
      "retryCount": 3,
      "retryInterval": 60000,
      "nextExecutionTime": "2024-01-02T02:00:00.000Z",
      "lastExecution": {
        "id": 123,
        "status": "success",
        "startTime": "2024-01-01T02:00:00.000Z",
        "endTime": "2024-01-01T02:05:30.000Z",
        "executionTimeMs": 330000,
        "errorMessage": null
      },
      "isRunning": false
    }
  ],
  "total": 3
}
```

### 2. 获取任务详情

获取指定任务的详细信息，包含配置、下次执行时间、最近执行记录。

**请求**:
```
GET /api/admin/tasks/:taskId/detail
```

**路径参数**:
- `taskId` (string): 任务 ID

**响应**:
```json
{
  "config": {
    "id": "data-process",
    "name": "数据处理任务",
    "description": "处理前一天的数据，生成统计报告",
    "cronExpression": "0 2 * * *",
    "timezone": "Asia/Shanghai",
    "enabled": true,
    "executorName": "dataProcessExecutor",
    "defaultParams": {
      "startTime": "{{yesterday.start}}",
      "endTime": "{{yesterday.end}}",
      "batchSize": 1000
    },
    "maxExecutionTime": 3600000,
    "retryCount": 3,
    "retryInterval": 60000
  },
  "nextExecutionTime": "2024-01-02T02:00:00.000Z",
  "lastExecution": {
    "id": 123,
    "status": "success",
    "startTime": "2024-01-01T02:00:00.000Z",
    "endTime": "2024-01-01T02:05:30.000Z",
    "executionTimeMs": 330000,
    "params": {
      "startTime": "2024-01-01T00:00:00.000Z",
      "endTime": "2024-01-01T23:59:59.999Z",
      "batchSize": 1000
    },
    "result": {
      "success": true,
      "data": {
        "processedCount": 1500
      }
    },
    "errorMessage": null
  },
  "isRunning": false
}
```

**错误响应**:
```json
{
  "code": "TASK_NOT_FOUND",
  "message": "任务不存在: invalid-task-id"
}
```

### 3. 启用/禁用任务

启用或禁用指定任务，启用时启动调度，禁用时停止调度。

**请求**:
```
POST /api/admin/tasks/:taskId/toggle
Content-Type: application/json

{
  "enabled": true
}
```

**路径参数**:
- `taskId` (string): 任务 ID

**请求体**:
- `enabled` (boolean): 是否启用任务

**响应**:
```json
{
  "success": true,
  "taskId": "data-process",
  "enabled": true,
  "message": "任务已启用"
}
```

**错误响应**:
```json
{
  "code": "TASK_NOT_FOUND",
  "message": "任务不存在: invalid-task-id"
}
```

### 4. 手动执行任务

手动立即执行指定任务，可选择性传入参数覆盖默认参数。

**请求**:
```
POST /api/admin/tasks/:taskId/execute
Content-Type: application/json

{
  "params": {
    "startTime": "2024-01-01T00:00:00.000Z",
    "endTime": "2024-01-01T23:59:59.999Z",
    "batchSize": 500
  }
}
```

**路径参数**:
- `taskId` (string): 任务 ID

**请求体**:
- `params` (object, 可选): 任务参数，覆盖默认参数

**响应**:
```json
{
  "success": true,
  "taskId": "data-process",
  "result": {
    "success": true,
    "data": {
      "processedCount": 1500
    },
    "message": "数据处理完成"
  },
  "message": "任务执行成功"
}
```

**错误响应**:

任务正在运行:
```json
{
  "code": "TASK_ALREADY_RUNNING",
  "message": "任务正在运行中，请稍后再试"
}
```

任务执行失败:
```json
{
  "success": false,
  "taskId": "data-process",
  "result": {
    "success": false,
    "message": "数据处理失败: 数据库连接超时"
  },
  "message": "任务执行失败"
}
```

### 5. 查询执行历史

查询指定任务的执行历史，支持分页和筛选。

**请求**:
```
GET /api/admin/tasks/:taskId/executions?page=1&pageSize=20&status=success&startTime=2024-01-01T00:00:00.000Z&endTime=2024-01-31T23:59:59.999Z
```

**路径参数**:
- `taskId` (string): 任务 ID

**查询参数**:
- `page` (number, 可选): 页码，默认 1
- `pageSize` (number, 可选): 每页数量，默认 20，最大 100
- `status` (string, 可选): 执行状态筛选，可选值: `running`, `success`, `failed`
- `startTime` (string, 可选): 开始时间筛选（ISO 8601 格式）
- `endTime` (string, 可选): 结束时间筛选（ISO 8601 格式）

**响应**:
```json
{
  "total": 150,
  "page": 1,
  "pageSize": 20,
  "executions": [
    {
      "id": 123,
      "taskId": "data-process",
      "taskName": "数据处理任务",
      "startTime": "2024-01-01T02:00:00.000Z",
      "endTime": "2024-01-01T02:05:30.000Z",
      "status": "success",
      "params": {
        "startTime": "2024-01-01T00:00:00.000Z",
        "endTime": "2024-01-01T23:59:59.999Z",
        "batchSize": 1000
      },
      "result": {
        "success": true,
        "data": {
          "processedCount": 1500
        }
      },
      "errorMessage": null,
      "executionTimeMs": 330000
    }
  ]
}
```

**错误响应**:
```json
{
  "code": "INVALID_PARAMS",
  "message": "pageSize 必须是 1-100 之间的整数"
}
```

### 6. 获取执行详情

获取单个执行记录的详细信息。

**请求**:
```
GET /api/admin/tasks/executions/:executionId
```

**路径参数**:
- `executionId` (number): 执行记录 ID

**响应**:
```json
{
  "id": 123,
  "taskId": "data-process",
  "taskName": "数据处理任务",
  "startTime": "2024-01-01T02:00:00.000Z",
  "endTime": "2024-01-01T02:05:30.000Z",
  "status": "success",
  "params": {
    "startTime": "2024-01-01T00:00:00.000Z",
    "endTime": "2024-01-01T23:59:59.999Z",
    "batchSize": 1000
  },
  "result": {
    "success": true,
    "data": {
      "processedCount": 1500
    },
    "message": "数据处理完成"
  },
  "errorMessage": null,
  "executionTimeMs": 330000,
  "createdAt": "2024-01-01T02:00:00.000Z"
}
```

**错误响应**:
```json
{
  "code": "EXECUTION_NOT_FOUND",
  "message": "执行记录不存在: 999"
}
```

## 错误代码

| 错误代码 | HTTP 状态码 | 说明 |
|---------|-----------|------|
| `METHOD_NOT_ALLOWED` | 405 | 请求方法不允许 |
| `INVALID_PARAMS` | 400 | 请求参数无效 |
| `TASK_NOT_FOUND` | 404 | 任务不存在 |
| `EXECUTION_NOT_FOUND` | 404 | 执行记录不存在 |
| `TASK_ALREADY_RUNNING` | 409 | 任务正在运行中 |
| `TASK_TIMEOUT` | 504 | 任务执行超时 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |
| `DATABASE_ERROR` | 500 | 数据库错误 |

## 使用示例

### 示例 1: 获取任务列表并启用某个任务

```javascript
// 1. 获取任务列表
const response = await fetch('/api/admin/tasks/list');
const { tasks } = await response.json();

// 2. 找到需要启用的任务
const task = tasks.find(t => t.id === 'data-process');

// 3. 如果任务被禁用，则启用它
if (!task.enabled) {
  await fetch(`/api/admin/tasks/${task.id}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true })
  });
}
```

### 示例 2: 手动执行任务并查看结果

```javascript
// 1. 手动执行任务
const executeResponse = await fetch('/api/admin/tasks/data-process/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    params: {
      startTime: '2024-01-01T00:00:00.000Z',
      endTime: '2024-01-01T23:59:59.999Z',
      batchSize: 500
    }
  })
});

const { success, result } = await executeResponse.json();

if (success) {
  console.log('任务执行成功:', result.data);
} else {
  console.error('任务执行失败:', result.message);
}
```

### 示例 3: 查询任务执行历史

```javascript
// 查询最近 7 天的成功执行记录
const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const endTime = new Date().toISOString();

const response = await fetch(
  `/api/admin/tasks/data-process/executions?` +
  `page=1&pageSize=20&status=success&` +
  `startTime=${encodeURIComponent(startTime)}&` +
  `endTime=${encodeURIComponent(endTime)}`
);

const { total, executions } = await response.json();

console.log(`找到 ${total} 条执行记录`);
executions.forEach(exec => {
  console.log(`执行 ${exec.id}: ${exec.status}, 耗时 ${exec.executionTimeMs}ms`);
});
```

## 注意事项

1. **权限验证**: 当前所有接口的权限验证标记为 TODO，需要在实际部署前实现管理员权限验证。

2. **并发控制**: 同一任务不能同时执行多次。如果任务正在运行，手动执行请求会返回 409 错误。

3. **参数模板**: 任务配置中的 `defaultParams` 支持动态参数模板，如 `{{yesterday.start}}`。手动执行时传入的参数会覆盖默认参数。

4. **时区处理**: 所有时间字段使用 ISO 8601 格式（UTC 时间），前端需要根据用户时区进行转换。

5. **分页限制**: 执行历史查询的 `pageSize` 最大为 100，超过此值会返回 400 错误。

6. **错误处理**: 所有接口都会返回详细的错误信息，包括错误代码、错误消息和可选的详细信息。
