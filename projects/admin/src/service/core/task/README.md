# 任务管理器使用文档

## 概述

任务管理器是一个基于 PostgreSQL 的任务调度和执行系统，支持定时任务和手动执行。系统提供了完整的任务生命周期管理，包括任务注册、调度、执行、历史记录等功能。

## 核心功能

- ✅ 定时任务调度（基于 cron 表达式）
- ✅ 手动执行任务
- ✅ 任务参数配置（支持动态参数模板）
- ✅ 执行历史记录
- ✅ 任务并发控制
- ✅ 错误处理和重试机制
- ✅ 任务状态管理（启用/禁用）
- ✅ 超时控制

## 快速开始

### 1. 创建任务配置

```typescript
import type { TaskConfig } from '@/types/task';

const myTask: TaskConfig = {
  id: 'my-task',
  name: '我的任务',
  description: '任务描述',
  cronExpression: '0 2 * * *', // 每天凌晨 2 点
  timezone: 'Asia/Shanghai',
  enabled: true,
  executorName: 'myTaskExecutor',
  defaultParams: {
    startTime: '{{yesterday.start}}',
    endTime: '{{yesterday.end}}'
  },
  maxExecutionTime: 3600000, // 1 小时
  retryCount: 3,
  retryInterval: 60000, // 1 分钟
  executor: async (params) => {
    // 实现任务逻辑
    console.log('执行任务...', params);
    
    return {
      success: true,
      data: { result: 'success' },
      message: '任务执行成功'
    };
  }
};
```

### 2. 初始化任务管理器

```typescript
import { Pool } from 'pg';
import { TaskManager } from '@/service/core/task/TaskManager';

// 创建数据库连接池
const pool = new Pool({
  connectionString: process.env.POSTGRES_CONNECTION_STRING
});

// 创建任务管理器
const taskManager = new TaskManager(pool);

// 初始化任务管理器
await taskManager.initialize([myTask]);

// 启动所有启用的任务
await taskManager.startAll();
```

### 3. 手动执行任务

```typescript
// 使用默认参数执行
const result = await taskManager.executeTask('my-task');

// 使用自定义参数执行
const result = await taskManager.executeTask('my-task', {
  startTime: new Date('2024-01-01'),
  endTime: new Date('2024-01-02')
});
```

## 任务配置说明

### TaskConfig 接口

```typescript
interface TaskConfig {
  id: string;                          // 任务 ID（唯一标识）
  name: string;                        // 任务名称
  description?: string;                // 任务描述
  cronExpression: string;              // Cron 表达式
  timezone?: string;                   // 时区（默认：Asia/Shanghai）
  enabled: boolean;                    // 是否启用
  executorName: string;                // 执行器名称
  defaultParams?: Record<string, any>; // 默认参数
  maxExecutionTime?: number;           // 最大执行时间（毫秒，默认：3600000）
  retryCount?: number;                 // 重试次数（默认：0）
  retryInterval?: number;              // 重试间隔（毫秒，默认：60000）
  executor: TaskExecutorFunction;      // 执行器函数
}
```

### Cron 表达式格式

```
* * * * * *
│ │ │ │ │ │
│ │ │ │ │ └─ 星期几 (0-7, 0 和 7 都表示周日)
│ │ │ │ └─── 月份 (1-12)
│ │ │ └───── 日期 (1-31)
│ │ └─────── 小时 (0-23)
│ └───────── 分钟 (0-59)
└─────────── 秒 (0-59, 可选)
```

**常用示例**：
- `0 2 * * *` - 每天凌晨 2 点
- `0 */6 * * *` - 每 6 小时
- `0 0 * * 0` - 每周日凌晨
- `0 0 1 * *` - 每月 1 号凌晨
- `*/5 * * * *` - 每 5 分钟

## 动态参数模板

任务管理器支持动态参数模板，在执行时自动计算参数值。

### 支持的模板

| 模板 | 说明 | 示例值 |
|------|------|--------|
| `{{yesterday.start}}` | 昨天开始时间 | 2024-01-01 00:00:00 |
| `{{yesterday.end}}` | 昨天结束时间 | 2024-01-01 23:59:59 |
| `{{today.start}}` | 今天开始时间 | 2024-01-02 00:00:00 |
| `{{today.end}}` | 今天结束时间 | 2024-01-02 23:59:59 |
| `{{lastWeek.start}}` | 上周开始时间 | 2023-12-25 00:00:00 |
| `{{lastWeek.end}}` | 上周结束时间 | 2023-12-31 23:59:59 |
| `{{lastMonth.start}}` | 上月开始时间 | 2023-12-01 00:00:00 |
| `{{lastMonth.end}}` | 上月结束时间 | 2023-12-31 23:59:59 |
| `{{now}}` | 当前时间 | 2024-01-02 10:30:00 |
| `{{timestamp}}` | 当前时间戳 | 1704168600000 |
| `{{now.iso}}` | ISO 格式当前时间 | 2024-01-02T10:30:00.000Z |

### 使用示例

```typescript
const taskConfig: TaskConfig = {
  // ...
  defaultParams: {
    // 使用动态模板
    startTime: '{{yesterday.start}}',
    endTime: '{{yesterday.end}}',
    
    // 固定值
    batchSize: 1000,
    
    // 嵌套对象
    filter: {
      createdAt: '{{lastWeek.start}}',
      status: 'active'
    }
  },
  executor: async (params) => {
    // params.startTime 会被自动解析为昨天的开始时间
    console.log(params.startTime); // Date 对象
    return { success: true };
  }
};
```

## API 参考

### TaskManager 类

#### initialize(taskConfigs: TaskConfig[]): Promise<void>
初始化任务管理器，加载任务配置并同步到数据库。

```typescript
await taskManager.initialize([task1, task2, task3]);
```

#### startAll(): Promise<void>
启动所有启用的任务调度。

```typescript
await taskManager.startAll();
```

#### startTask(taskId: string): Promise<void>
启动指定任务的调度。

```typescript
await taskManager.startTask('my-task');
```

#### stopTask(taskId: string): void
停止指定任务的调度。

```typescript
taskManager.stopTask('my-task');
```

#### executeTask(taskId: string, params?: Record<string, any>): Promise<TaskResult>
执行任务（定时或手动）。

```typescript
const result = await taskManager.executeTask('my-task', {
  customParam: 'value'
});
```

#### toggleTask(taskId: string, enabled: boolean): Promise<void>
启用/禁用任务。

```typescript
await taskManager.toggleTask('my-task', false);
```

#### getTaskConfig(taskId: string): TaskConfig | undefined
获取任务配置。

```typescript
const config = taskManager.getTaskConfig('my-task');
```

#### getAllTaskConfigs(): TaskConfig[]
获取所有任务配置。

```typescript
const configs = taskManager.getAllTaskConfigs();
```

#### getNextExecutionTime(taskId: string): Date | null
计算任务的下次执行时间。

```typescript
const nextTime = taskManager.getNextExecutionTime('my-task');
```

#### getExecutionHistory(taskId?: string, options?: QueryOptions): Promise<{ total: number; executions: TaskExecution[] }>
获取执行历史。

```typescript
const history = await taskManager.getExecutionHistory('my-task', {
  page: 1,
  pageSize: 20,
  status: 'success'
});
```

#### getLastExecution(taskId: string): Promise<TaskExecution | null>
获取任务的最近一次执行记录。

```typescript
const lastExecution = await taskManager.getLastExecution('my-task');
```

#### stopAll(): void
停止所有任务调度。

```typescript
taskManager.stopAll();
```

#### getRunningTasks(): string[]
获取正在运行的任务列表。

```typescript
const runningTasks = taskManager.getRunningTasks();
```

#### isTaskRunning(taskId: string): boolean
检查任务是否正在运行。

```typescript
const isRunning = taskManager.isTaskRunning('my-task');
```

## 错误处理和重试机制

### 错误处理

任务管理器会自动捕获和记录所有任务执行过程中的错误。

#### 错误类型

```typescript
enum TaskErrorType {
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',           // 任务配置不存在
  TASK_ALREADY_RUNNING = 'TASK_ALREADY_RUNNING',   // 任务正在运行
  TASK_EXECUTION_FAILED = 'TASK_EXECUTION_FAILED', // 任务执行失败
  TASK_TIMEOUT = 'TASK_TIMEOUT',                   // 任务超时
  PARAMETER_INVALID = 'PARAMETER_INVALID',         // 参数无效
  DATABASE_ERROR = 'DATABASE_ERROR'                // 数据库错误
}
```

#### 错误信息记录

所有错误都会记录到数据库，包含：
- **错误类型**: 错误的分类（如 TaskError、Error 等）
- **错误消息**: 错误的描述信息
- **堆栈信息**: 完整的错误堆栈（用于调试）

```typescript
// 错误信息格式
{
  type: 'TaskError',
  message: '任务执行失败',
  stack: 'Error: 任务执行失败\n    at ...',
  fullMessage: '[TaskError] 任务执行失败\n堆栈信息:\nError: ...'
}
```

#### 错误处理示例

```typescript
try {
  await taskManager.executeTask('my-task');
} catch (error) {
  if (error instanceof TaskError) {
    switch (error.type) {
      case TaskErrorType.TASK_ALREADY_RUNNING:
        console.log('任务正在运行中');
        break;
      case TaskErrorType.TASK_TIMEOUT:
        console.log('任务执行超时');
        break;
      default:
        console.error('任务执行失败', error.message);
    }
  }
}
```

### 重试机制

任务失败后会自动进行重试，重试次数和间隔可配置。

#### 配置重试

```typescript
const taskConfig: TaskConfig = {
  id: 'my-task',
  name: '我的任务',
  // ...
  retryCount: 3,        // 失败后重试 3 次
  retryInterval: 60000, // 每次重试间隔 1 分钟（60000 毫秒）
  executor: async (params) => {
    // 任务逻辑
    return { success: true };
  }
};
```

#### 重试流程

1. **初次执行**: 任务首次执行
2. **失败检测**: 如果执行失败（抛出异常或返回 success: false）
3. **等待间隔**: 等待 `retryInterval` 毫秒
4. **第 1 次重试**: 重新执行任务
5. **继续重试**: 如果仍然失败，继续重试直到达到 `retryCount`
6. **最终失败**: 重试次数耗尽后，标记为最终失败

#### 重试记录

每次重试都会创建新的执行记录，可以在执行历史中查看：

```typescript
// 查询执行历史
const history = await taskManager.getExecutionHistory('my-task');

// 可以看到多条记录（初次执行 + 重试）
// [
//   { id: 1, status: 'failed', ... },  // 初次执行失败
//   { id: 2, status: 'failed', ... },  // 第 1 次重试失败
//   { id: 3, status: 'failed', ... },  // 第 2 次重试失败
//   { id: 4, status: 'success', ... }  // 第 3 次重试成功
// ]
```

#### 重试日志

重试过程会记录详细的日志：

```
[INFO] 开始执行任务: my-task - 我的任务
[ERROR] 任务执行异常: my-task (尝试 1/4)
[INFO] 任务重试 (1/3): my-task - 我的任务
[INFO] [重试 1/3] 开始执行任务: my-task - 我的任务
[ERROR] 任务执行异常: my-task (尝试 2/4)
[INFO] 任务重试 (2/3): my-task - 我的任务
[INFO] [重试 2/3] 开始执行任务: my-task - 我的任务
[INFO] [重试 2/3] 任务执行完成: my-task
[INFO] 任务重试成功: my-task (重试次数: 2)
```

### 超时控制

任务执行时间超过配置的最大执行时间会被自动终止。

#### 配置超时时间

```typescript
const taskConfig: TaskConfig = {
  id: 'my-task',
  name: '我的任务',
  // ...
  maxExecutionTime: 1800000, // 30 分钟（1800000 毫秒）
  executor: async (params) => {
    // 如果执行超过 30 分钟，会被自动终止
    return { success: true };
  }
};
```

#### 超时处理流程

1. **启动超时定时器**: 任务开始执行时启动定时器
2. **竞速执行**: 任务执行和超时定时器同时进行
3. **任务完成**: 如果任务在超时前完成，清除定时器
4. **超时终止**: 如果超时，抛出 `TASK_TIMEOUT` 错误
5. **记录错误**: 超时错误会被记录到数据库
6. **释放资源**: 自动释放任务锁

#### 超时错误示例

```typescript
// 超时错误信息
{
  type: 'TASK_TIMEOUT',
  message: '任务执行超时: my-task (最大执行时间: 1800000ms)',
  fullMessage: '[TASK_TIMEOUT] 任务执行超时: my-task (最大执行时间: 1800000ms)\n堆栈信息:\n...'
}
```

#### 超时日志

```
[INFO] 开始执行任务: my-task - 我的任务
[ERROR] 任务执行超时: my-task
[ERROR] 任务超时终止: my-task
[ERROR] 任务执行失败: my-task
```

### 最佳实践

#### 1. 合理设置重试次数

```typescript
// 对于网络请求等可能临时失败的任务，设置较多重试次数
const networkTask: TaskConfig = {
  // ...
  retryCount: 5,
  retryInterval: 30000 // 30 秒
};

// 对于数据处理等逻辑错误，设置较少重试次数
const dataTask: TaskConfig = {
  // ...
  retryCount: 1,
  retryInterval: 60000 // 1 分钟
};
```

#### 2. 设置合理的超时时间

```typescript
// 根据任务的实际执行时间设置超时时间
const quickTask: TaskConfig = {
  // ...
  maxExecutionTime: 300000 // 5 分钟
};

const longTask: TaskConfig = {
  // ...
  maxExecutionTime: 3600000 // 1 小时
};
```

#### 3. 在执行器中处理错误

```typescript
executor: async (params) => {
  try {
    // 执行任务逻辑
    const result = await processData(params);
    
    return {
      success: true,
      data: result
    };
  } catch (error) {
    // 记录详细的错误信息
    console.error('任务执行失败', error);
    
    // 返回失败结果（会触发重试）
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}
```

#### 4. 监控执行历史

```typescript
// 定期检查失败的任务
const failedTasks = await taskManager.getExecutionHistory(undefined, {
  status: 'failed',
  page: 1,
  pageSize: 100
});

// 分析失败原因
failedTasks.executions.forEach(execution => {
  console.log(`任务 ${execution.taskName} 失败:`, execution.errorMessage);
});
```

## 最佳实践

### 1. 任务执行器设计

```typescript
executor: async (params) => {
  try {
    // 1. 验证参数
    if (!params.startTime || !params.endTime) {
      return {
        success: false,
        message: '缺少必要参数'
      };
    }
    
    // 2. 执行业务逻辑
    const result = await processData(params);
    
    // 3. 返回结果
    return {
      success: true,
      data: result,
      message: '处理成功',
      metadata: {
        processedCount: result.length
      }
    };
  } catch (error) {
    // 4. 错误处理
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}
```

### 2. 合理设置超时时间

```typescript
const taskConfig: TaskConfig = {
  // ...
  maxExecutionTime: 1800000, // 30 分钟
  // 根据任务的实际执行时间设置合理的超时时间
};
```

### 3. 配置重试策略

```typescript
const taskConfig: TaskConfig = {
  // ...
  retryCount: 3,        // 失败后重试 3 次
  retryInterval: 60000, // 每次重试间隔 1 分钟
};
```

### 4. 使用动态参数

```typescript
const taskConfig: TaskConfig = {
  // ...
  defaultParams: {
    // 使用动态参数模板，避免硬编码时间
    startTime: '{{yesterday.start}}',
    endTime: '{{yesterday.end}}'
  }
};
```

### 5. 记录详细日志

```typescript
executor: async (params) => {
  console.log('开始执行任务', { params });
  
  const result = await processData(params);
  
  console.log('任务执行完成', { result });
  
  return {
    success: true,
    data: result,
    metadata: {
      // 记录有用的元数据
      processedCount: result.length,
      duration: result.duration
    }
  };
}
```

## 数据库表结构

### task_configs 表

存储任务配置信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(50) | 任务 ID（主键） |
| name | VARCHAR(255) | 任务名称 |
| description | TEXT | 任务描述 |
| cron_expression | VARCHAR(100) | Cron 表达式 |
| timezone | VARCHAR(50) | 时区 |
| enabled | BOOLEAN | 是否启用 |
| executor_name | VARCHAR(100) | 执行器名称 |
| default_params | JSONB | 默认参数 |
| max_execution_time | INTEGER | 最大执行时间（毫秒） |
| retry_count | INTEGER | 重试次数 |
| retry_interval | INTEGER | 重试间隔（毫秒） |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### task_executions 表

存储任务执行历史。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 执行 ID（主键） |
| task_id | VARCHAR(50) | 任务 ID |
| task_name | VARCHAR(255) | 任务名称 |
| start_time | TIMESTAMP | 开始时间 |
| end_time | TIMESTAMP | 结束时间 |
| status | VARCHAR(20) | 状态（running/success/failed） |
| params | JSONB | 执行参数 |
| result | JSONB | 执行结果 |
| error_message | TEXT | 错误信息 |
| execution_time_ms | INTEGER | 执行耗时（毫秒） |
| created_at | TIMESTAMP | 创建时间 |

## 常见问题

### Q: 如何添加新任务？

A: 创建任务配置并在初始化时传入：

```typescript
const newTask: TaskConfig = {
  id: 'new-task',
  // ... 其他配置
  executor: async (params) => {
    // 实现逻辑
    return { success: true };
  }
};

await taskManager.initialize([...existingTasks, newTask]);
```

### Q: 如何处理任务并发？

A: 任务管理器自动处理并发控制，同一任务不会同时执行多次。如果任务正在运行，新的执行请求会被拒绝。

### Q: 如何查看任务执行历史？

A: 使用 `getExecutionHistory` 方法：

```typescript
const history = await taskManager.getExecutionHistory('my-task', {
  page: 1,
  pageSize: 20,
  status: 'failed' // 只查看失败的记录
});
```

### Q: 如何自定义参数模板？

A: 使用 ParameterParser 的 `addTemplate` 方法：

```typescript
const paramParser = new ParameterParser();
paramParser.addTemplate('custom.template', () => {
  return new Date('2024-01-01');
});
```

### Q: 任务执行失败后会自动重试吗？

A: 是的！如果配置了 `retryCount` 和 `retryInterval`，任务失败后会自动重试。每次重试都会创建新的执行记录。

```typescript
const taskConfig: TaskConfig = {
  // ...
  retryCount: 3,        // 失败后重试 3 次
  retryInterval: 60000, // 每次重试间隔 1 分钟
};
```

### Q: 如何处理任务超时？

A: 任务管理器会自动检测超时。如果任务执行时间超过 `maxExecutionTime`，任务会被终止并记录超时错误。

```typescript
const taskConfig: TaskConfig = {
  // ...
  maxExecutionTime: 1800000, // 30 分钟超时
};
```

### Q: 错误信息会记录到哪里？

A: 所有错误信息都会记录到 `task_executions` 表的 `error_message` 字段中，包括错误类型、错误消息和堆栈信息。

## 示例代码

完整的示例代码请参考：
- `taskConfig.example.ts` - 任务配置示例
- `TaskManager.ts` - 任务管理器实现
- `ParameterParser.ts` - 参数解析器实现
- `TaskStorage.ts` - 数据存储层实现
