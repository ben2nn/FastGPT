/**
 * 手动执行 API 单元测试（异步受理）
 * 覆盖：202 + executionId 结构、后台失败不影响响应、404/409/400 语义不回归、非 POST 405
 */

import { NextApiResponse } from 'next';

jest.mock('@fastgpt/service/common/system/log', () => ({
  addLog: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() }
}));

jest.mock('@/service/middleware/entry', () => ({
  NextAPI: jest.fn((...handlers: any[]) => handlers[0])
}));

jest.mock('@/service/support/permission/auth', () => ({
  authAdmin: jest.fn()
}));

jest.mock('@/service/core/task/instance', () => ({
  getTaskManager: jest.fn()
}));

import { authAdmin } from '@/service/support/permission/auth';
import { getTaskManager } from '@/service/core/task/instance';
import { TaskError, TaskErrorType } from '@/service/common/errors';
import handler from '@/pages/api/admin/tasks/[taskId]/execute';

const mockAuthAdmin = authAdmin as jest.Mock;
const mockGetTaskManager = getTaskManager as jest.Mock;

function makeReq(method: string, taskId?: string, params?: Record<string, any>): any {
  return {
    method,
    query: taskId ? { taskId } : {},
    body: params ? { params } : {},
    headers: {},
    setHeader: jest.fn()
  };
}

function makeRes(): NextApiResponse & { json: jest.Mock } {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
}

function mockManager(overrides: Record<string, any> = {}) {
  return {
    getTaskConfig: jest.fn().mockReturnValue({ id: 'demo-task', name: '演示任务' }),
    startExecution: jest.fn(),
    ...overrides
  };
}

beforeEach(() => {
  mockAuthAdmin.mockReset();
  mockAuthAdmin.mockResolvedValue({ tmbId: 't1' });
  mockGetTaskManager.mockReset();
});

describe('POST /api/admin/tasks/:taskId/execute（异步受理）', () => {
  it('受理成功返回 202 与 executionId，不等待后台执行', async () => {
    let rejectDone!: (e: any) => void;
    const done = new Promise((_, reject) => (rejectDone = reject));
    const manager = mockManager({
      startExecution: jest.fn().mockResolvedValue({ executionId: 501, done })
    });
    mockGetTaskManager.mockResolvedValue(manager);

    const res = makeRes();
    await handler(makeReq('POST', 'demo-task', { a: 1 }), res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      taskId: 'demo-task',
      executionId: 501,
      status: 'running',
      message: '任务已提交执行'
    });
    expect(manager.startExecution).toHaveBeenCalledWith('demo-task', { a: 1 });

    // 后台失败已挂 catch，不影响已返回的响应，也不产生未处理 rejection
    rejectDone(new Error('后台执行失败'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('任务不存在返回 404，不调用受理', async () => {
    const manager = mockManager({ getTaskConfig: jest.fn().mockReturnValue(undefined) });
    mockGetTaskManager.mockResolvedValue(manager);

    const res = makeRes();
    await handler(makeReq('POST', 'not-exist'), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(manager.startExecution).not.toHaveBeenCalled();
  });

  it('任务正在运行返回 409', async () => {
    const manager = mockManager({
      startExecution: jest
        .fn()
        .mockRejectedValue(
          new TaskError(TaskErrorType.TASK_ALREADY_RUNNING, '任务正在运行中: demo-task')
        )
    });
    mockGetTaskManager.mockResolvedValue(manager);

    const res = makeRes();
    await handler(makeReq('POST', 'demo-task'), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: '任务正在运行中，请稍后再试' })
    );
  });

  it('缺少 taskId 返回 400', async () => {
    const res = makeRes();
    await handler(makeReq('POST'), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_PARAMS' }));
  });

  it('非 POST 请求返回 405（受理前校验）', async () => {
    const res = makeRes();
    await handler(makeReq('GET', 'demo-task'), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(mockAuthAdmin).not.toHaveBeenCalled();
  });
});
