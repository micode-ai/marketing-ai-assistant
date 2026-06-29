import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';

function makePrisma() {
  return {
    task: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 't1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 't1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 't1' }),
    },
  };
}

describe('TasksService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: TasksService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new TasksService(prisma as any); });

  it('list scope=overdue → OPEN + dueDate < startOfToday', async () => {
    await service.list('p1', { scope: 'overdue' });
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.projectId).toBe('p1');
    expect(where.status).toBe('OPEN');
    expect(where.dueDate.lt).toBeInstanceOf(Date);
  });

  it('list scope=today → OPEN + startOfToday <= dueDate < startOfTomorrow', async () => {
    await service.list('p1', { scope: 'today' });
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('OPEN');
    expect(where.dueDate.gte).toBeInstanceOf(Date);
    expect(where.dueDate.lt).toBeInstanceOf(Date);
  });

  it('create sets OPEN status + project scope', async () => {
    await service.create('p1', { title: 'Call Bob', dueDate: '2026-07-01', ownerId: 'u1' });
    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'p1', title: 'Call Bob', status: 'OPEN', ownerId: 'u1' });
    expect(data.dueDate).toBeInstanceOf(Date);
  });

  it('complete sets DONE + completedAt; reopen clears it; both project-scoped', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 't1', projectId: 'p1' });
    await service.complete('p1', 't1');
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({ status: 'DONE' });
    expect(prisma.task.update.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
    await service.reopen('p1', 't1');
    expect(prisma.task.update.mock.calls[1][0].data).toEqual({ status: 'OPEN', completedAt: null });
  });

  it('complete throws NotFound when foreign', async () => {
    prisma.task.findFirst.mockResolvedValue(null);
    await expect(service.complete('p1', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('summary returns overdue/today/upcoming counts', async () => {
    prisma.task.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(5);
    const s = await service.summary('p1', {});
    expect(s).toEqual({ overdue: 2, today: 1, upcoming: 5 });
  });
});
