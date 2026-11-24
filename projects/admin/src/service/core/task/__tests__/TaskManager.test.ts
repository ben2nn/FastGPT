/**
 * TaskManager 异步执行编排单元测试
 * 覆盖：受理即返回、后台终态写入、重试复用单条记录、并发 409、锁占用 409、超时、锁释放、重启恢复调用
 * TaskStorage 全部 mock
 */

jest.mock('@fastgpt/service/common/system/log', () => ({
  addLog: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() }
}));

// cron 调度 mock：记录回调，便于直接驱动「定时触发重叠」场景
jest.mock('node-cron', () => {
  const callbacks: Record<string, any> = {};
  const schedule = jest.fn((expr: string, cb: any) => {
    callbacks[expr] = cb;
    return { stop: jest.fn() };
  });
  return {
    __esModule: true,
    default: { schedule, validate: () => true },
    __callbacks: callbacks
  };
});

jest.mock('@/service/core/task/TaskStorage', () => {
  class MockTaskStorage {
    syncConfig = jest.fn().mockResolvedValue(undefined);
    getAllTaskConfigs = jest.fn().mockResolvedValue([]);
    getEnabledTaskConfigs = jest.fn().mockResolvedValue([]);
    acquireLock = jest.fn();
    releaseLock = jest.fn().mockResolvedValue(undefined);
    createExecution = jest.fn().mockResolvedValue(101);
    updateExecution = jest.fn().mockResolvedValue(undefined);
    recoverStaleExecutions = jest.fn().mockResolvedValue(0);
  }
  return { TaskStorage: MockTaskStorage };
});

import { TaskManager } from '@/service/core/task/TaskManager';
import { TaskError, TaskErrorType } from '@/service/common/errors';
import { addLog } from '@fastgpt/service/common/system/log';
import type { TaskConfig } from '@/types/task';

const mockAddLog = addLog as unknown as {
  info: jest.Mock;
  error: jest.Mock;
  warn: jest.Mock;
  debug: jest.Mock;
};
const cronMock = jest.requireMock('node-cron') as any;

function makeManager(
  configOverrides: Partial<Omit<TaskConfig, 'executor'>> & { executor?: any } = {}
) {
  const manager = new TaskManager({} as any);
  const storage = (manager as any).storage;
  const held = { lockId: 7, client: { release: jest.fn() } };
  storage.acquireLock.mockResolvedValue(held);

  const config: TaskConfig = {
    id: 'demo-task',
    name: '演示任务',
    cronExpression: '* * * * *',
    enabled: true,
    executorName: 'demoExecutor',
    executor: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
    ...configOverrides
  };
  (manager as any).configs.set(config.id, config);

  return { manager, storage, held: held as any, config };
}

describe('TaskManager.startExecution', () => {
  it('受理即返回 executionId，不等待执行器完成', async () => {
    let resolveExecutor!: (v: any) => void;
    const executor = jest.fn(() => new Promise((resolve) => (resolveExecutor = resolve)));
    const { manager, storage, held } = makeManager({ executor });

    const { executionId, done } = await manager.startExecution('demo-task');

    expect(executionId).toBe(101);
    expect(storage.createExecution).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'demo-task', status: 'running' })
    );
    // 执行器已启动但尚未完成；接口已经返回
    expect(executor).toHaveBeenCalledTimes(1);

    resolveExecutor({ success: true, message: 'done' });
    const result = await done;

    expect(result.success).toBe(true);
    // 终态写入同一执行记录
    expect(storage.updateExecution).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ status: 'success' })
    );
    // 执行结束释放锁（同连接对象）
    expect(storage.releaseLock).toHaveBeenCalledWith(held);
    expect((manager as any).runningTasks.has('demo-task')).toBe(false);
  });

  it('成功后 attempts 写入 result.metadata', async () => {
    const { manager } = makeManager();
    const { done } = await manager.startExecution('demo-task');
    const result = await done;

    expect(result.metadata).toEqual(expect.objectContaining({ attempts: 1 }));
  });

  it('重试成功仍只有一条执行记录（不重复创建）', async () => {
    const executor = jest
      .fn()
      .mockResolvedValueOnce({ success: false, message: '第一次失败' })
      .mockResolvedValueOnce({ success: true, message: '第二次成功' });
    const { manager, storage } = makeManager({ executor, retryCount: 1, retryInterval: 1 });

    const { done } = await manager.startExecution('demo-task');
    const result = await done;

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual(expect.objectContaining({ attempts: 2 }));
    expect(storage.createExecution).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('重试耗尽后记录 failed 并抛出，错误信息包含尝试次数', async () => {
    const executor = jest.fn().mockResolvedValue({ success: false, message: '不稳定' });
    const { manager, storage } = makeManager({ executor, retryCount: 1, retryInterval: 1 });

    const { done } = await manager.startExecution('demo-task');

    await expect(done).rejects.toMatchObject({
      type: TaskErrorType.TASK_EXECUTION_FAILED
    });
    const finalUpdate = storage.updateExecution.mock.calls.at(-1);
    expect(finalUpdate![1].status).toBe('failed');
    expect(finalUpdate![1].errorMessage).toContain('已重试 1 次');
  });

  it('执行超时记录 failed（TASK_TIMEOUT）并释放锁', async () => {
    const executor = jest.fn(() => new Promise(() => {})); // 永不完成
    const { manager, storage, held } = makeManager({ executor, maxExecutionTime: 10 });

    const { done } = await manager.startExecution('demo-task');

    await expect(done).rejects.toMatchObject({ type: TaskErrorType.TASK_TIMEOUT });
    const finalUpdate = storage.updateExecution.mock.calls.at(-1);
    expect(finalUpdate![1].status).toBe('failed');
    expect(storage.releaseLock).toHaveBeenCalledWith(held);
  });

  it('本进程已在运行 -> 409 语义，不重复加锁或创建记录', async () => {
    const executor = jest.fn(() => new Promise(() => {}));
    const { manager, storage } = makeManager({ executor });

    const first = await manager.startExecution('demo-task');
    expect(first.executionId).toBe(101);

    await expect(manager.startExecution('demo-task')).rejects.toMatchObject({
      type: TaskErrorType.TASK_ALREADY_RUNNING
    });
    expect(storage.acquireLock).toHaveBeenCalledTimes(1);
    expect(storage.createExecution).toHaveBeenCalledTimes(1);
  });

  it('锁被其他实例占用 -> TASK_ALREADY_RUNNING，不创建记录', async () => {
    const { manager, storage } = makeManager();
    storage.acquireLock.mockResolvedValueOnce(null);

    await expect(manager.startExecution('demo-task')).rejects.toMatchObject({
      type: TaskErrorType.TASK_ALREADY_RUNNING
    });
    expect(storage.createExecution).not.toHaveBeenCalled();
    expect((manager as any).runningTasks.has('demo-task')).toBe(false);
  });

  it('任务不存在 -> CONFIG_NOT_FOUND', async () => {
    const { manager } = makeManager();

    await expect(manager.startExecution('not-exist')).rejects.toMatchObject({
      type: TaskErrorType.CONFIG_NOT_FOUND
    });
  });

  it('创建执行记录失败时回滚运行标记与锁', async () => {
    const { manager, storage, held } = makeManager();
    storage.createExecution.mockRejectedValueOnce(
      new TaskError(TaskErrorType.DATABASE_ERROR, '插入失败')
    );

    await expect(manager.startExecution('demo-task')).rejects.toBeInstanceOf(TaskError);
    expect(storage.releaseLock).toHaveBeenCalledWith(held);
    expect((manager as any).runningTasks.has('demo-task')).toBe(false);
  });
});

describe('TaskManager.executeTask（等待版本）', () => {
  it('等待后台执行完成并返回结果', async () => {
    const { manager } = makeManager();

    const result = await manager.executeTask('demo-task');

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual(expect.objectContaining({ attempts: 1 }));
  });
});

describe('TaskManager.initialize', () => {
  it('初始化完成后调用遗留执行记录恢复', async () => {
    const manager = new TaskManager({} as any);
    const storage = (manager as any).storage;

    await manager.initialize([]);

    expect(storage.recoverStaleExecutions).toHaveBeenCalledTimes(1);
  });

  it('恢复失败不阻断初始化', async () => {
    const manager = new TaskManager({} as any);
    const storage = (manager as any).storage;
    storage.recoverStaleExecutions.mockRejectedValueOnce(new Error('db down'));

    await expect(manager.initialize([])).resolves.toBeUndefined();
  });
});

describe('TaskManager 终态写入可靠性', () => {
  beforeEach(() => {
    mockAddLog.error.mockClear();
  });

  it('数据库瞬时失败时重试一次后成功', async () => {
    const { manager, storage } = makeManager();
    storage.updateExecution
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue(undefined);

    const { done } = await manager.startExecution('demo-task');
    const result = await done;

    expect(result.success).toBe(true);
    expect(storage.updateExecution).toHaveBeenCalledTimes(2);
    expect(mockAddLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('200ms 后重试'),
      expect.any(Object)
    );
  });

  it('终态写入持续失败仅记录错误日志，不抛出，且仍释放锁', async () => {
    const { manager, storage, held } = makeManager();
    storage.updateExecution.mockRejectedValue(new Error('db down'));

    const { done } = await manager.startExecution('demo-task');
    await expect(done).resolves.toMatchObject({ success: true });

    expect(mockAddLog.error).toHaveBeenCalledWith(
      expect.stringContaining('写入执行记录终态失败（已重试 1 次'),
      expect.any(Error)
    );
    expect(storage.releaseLock).toHaveBeenCalledWith(held);
  });
});

describe('cron 定时触发', () => {
  beforeEach(() => {
    mockAddLog.error.mockClear();
  });

  it('上次执行未结束时的触发被跳过并记录告警，不并发执行', async () => {
    let resolveExecutor!: (v: any) => void;
    const executor = jest.fn(() => new Promise((resolve) => (resolveExecutor = resolve)));
    const { manager } = makeManager({ executor });

    await manager.startTask('demo-task');
    const callback = cronMock.__callbacks['* * * * *'];
    expect(typeof callback).toBe('function');

    // 第一次触发：进入执行（后台未完成）
    const firstRun = callback();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 第二次触发：任务运行中 -> 跳过并告警
    await callback();

    expect(executor).toHaveBeenCalledTimes(1);
    expect(mockAddLog.error).toHaveBeenCalledWith(
      expect.stringContaining('定时任务执行失败'),
      expect.any(Object)
    );

    resolveExecutor({ success: true });
    await firstRun;
  });
});
