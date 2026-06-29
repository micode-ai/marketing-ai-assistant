import { TimelineService } from './timeline.service';

function makePrisma() {
  return {
    activity: { findMany: jest.fn().mockResolvedValue([]) },
    task: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('TimelineService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: TimelineService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new TimelineService(prisma as any); });

  it('merges activities + tasks for a contact and sorts by date desc', async () => {
    prisma.activity.findMany.mockResolvedValue([
      { id: 'a1', occurredAt: new Date('2026-06-10'), type: 'CALL', body: 'rang' },
    ]);
    prisma.task.findMany.mockResolvedValue([
      { id: 't1', dueDate: new Date('2026-06-20'), createdAt: new Date('2026-06-01'), title: 'follow up' },
      { id: 't2', dueDate: null, createdAt: new Date('2026-06-05'), title: 'no due' },
    ]);

    const items = await service.timeline('p1', { contactId: 'c1' });

    expect(items.map((i) => i.id)).toEqual(['t1', 'a1', 't2']); // 06-20, 06-10, 06-05(createdAt fallback)
    expect(items[0]).toMatchObject({ kind: 'task', id: 't1' });
    expect(items[1]).toMatchObject({ kind: 'activity', id: 'a1' });
    // both queries scoped to the contact
    expect(prisma.activity.findMany.mock.calls[0][0].where).toMatchObject({ projectId: 'p1', contactId: 'c1' });
    expect(prisma.task.findMany.mock.calls[0][0].where).toMatchObject({ projectId: 'p1', contactId: 'c1' });
  });
});
