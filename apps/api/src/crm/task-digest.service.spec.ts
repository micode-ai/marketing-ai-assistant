import { TaskDigestService } from './task-digest.service';

describe('TaskDigestService.handleCron', () => {
  it('groups due/overdue OPEN tasks by owner and sends one digest per owner in their language', async () => {
    const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
    const yesterday = new Date(startOfToday.getTime() - 3600_000);
    const laterToday = new Date(startOfToday.getTime() + 3600_000);
    const prisma: any = {
      project: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Acme' }]) },
      task: {
        findMany: jest.fn().mockResolvedValue([
          { id: 't1', title: 'Overdue call', dueDate: yesterday, ownerId: 'u1', owner: { id: 'u1', email: 'u1@x.com', language: 'ru', name: 'U1' }, contact: null, deal: null },
          { id: 't2', title: 'Today email', dueDate: laterToday, ownerId: 'u1', owner: { id: 'u1', email: 'u1@x.com', language: 'ru', name: 'U1' }, contact: null, deal: null },
          { id: 't3', title: 'Other owner', dueDate: laterToday, ownerId: 'u2', owner: { id: 'u2', email: 'u2@x.com', language: 'en', name: 'U2' }, contact: null, deal: null },
        ]),
      },
    };
    const mail = { sendTaskDigest: jest.fn().mockResolvedValue(undefined) };
    const notifier = { report: jest.fn() };
    const service = new TaskDigestService(prisma, mail as any, notifier as any);

    await service.handleCron();

    expect(mail.sendTaskDigest).toHaveBeenCalledTimes(2); // u1 + u2
    const u1Call = mail.sendTaskDigest.mock.calls.find((c: any) => c[0].to === 'u1@x.com')[0];
    expect(u1Call.language).toBe('ru');
    expect(u1Call.overdue.map((t: any) => t.title)).toEqual(['Overdue call']);
    expect(u1Call.today.map((t: any) => t.title)).toEqual(['Today email']);
  });

  it('reports a per-project failure via CronFailureNotifier and continues', async () => {
    const prisma: any = {
      project: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Acme', organizationId: 'org_1' }]) },
      task: { findMany: jest.fn().mockRejectedValue(new Error('db down')) },
    };
    const mail = { sendTaskDigest: jest.fn() };
    const notifier = { report: jest.fn() };
    const service = new TaskDigestService(prisma, mail as any, notifier as any);
    await service.handleCron();
    expect(notifier.report).toHaveBeenCalledTimes(1);
  });
});
