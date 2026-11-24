/**
 * 任务列表 API 单元测试
 * 覆盖：isRunning 在执行中/结束后的两态取值、列表结构不回归
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
import handler from '@/pages/api/admin/tasks/list';

const mockAuthAdmin = authAdmin as jest.Mock;
const mockGetTaskManager = getTaskManager as jest.Mock;

function makeReq(): any {
  return { method: 'GET', query: {}, headers: {}, setHeader: jest.fn() };
}

function makeRes(): NextApiResponse & { json: jest.Mock } {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
}

function makeManager(isRunning: boolean) {
  return {
    getAllTaskConfigs: jest.fn().mockReturnValue([
      {
        id: 'demo-task',
        name: '演示任务',
        cronExpression: '* * * * *',
        enabled: true,
        executorName: 'demoExecutor'
      }
    ]),
    getNextExecutionTime: jest.fn().mockReturnValue(new Date('2026-12-01T00:00:00Z')),
    getLastExecution: jest.fn().mockResolvedValue(null),
    isTaskRunning: jest.fn().mockReturnValue(isRunning)
  };
}

beforeEach(() => {
  mockAuthAdmin.mockReset();
  mockAuthAdmin.mockResolvedValue({ tmbId: 't1' });
  mockGetTaskManager.mockReset();
});

describe('GET /api/admin/tasks/list - isRunning', () => {
  it('任务执行中时 isRunning=true', async () => {
    mockGetTaskManager.mockResolvedValue(makeManager(true));

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.total).toBe(1);
    expect(payload.tasks[0].isRunning).toBe(true);
  });

  it('任务执行结束后 isRunning=false', async () => {
    mockGetTaskManager.mockResolvedValue(makeManager(false));

    const res = makeRes();
    await handler(makeReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.tasks[0].isRunning).toBe(false);
  });

  it('列表项包含既有字段（不回归）', async () => {
    mockGetTaskManager.mockResolvedValue(makeManager(false));

    const res = makeRes();
    await handler(makeReq(), res);

    const item = res.json.mock.calls[0][0].tasks[0];
    expect(item).toEqual(
      expect.objectContaining({
        id: 'demo-task',
        name: '演示任务',
        cronExpression: '* * * * *',
        enabled: true,
        nextExecutionTime: '2026-12-01T00:00:00.000Z',
        lastExecution: null,
        isRunning: false
      })
    );
  });

  it('非 GET 请求返回 405', async () => {
    const res = makeRes();
    await handler({ ...makeReq(), method: 'POST' }, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(mockAuthAdmin).not.toHaveBeenCalled();
  });
});
