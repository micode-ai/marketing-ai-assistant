import { NotFoundException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';

function makePrisma() {
  return {
    activity: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'a1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'a1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'a1' }),
    },
  };
}

describe('ActivitiesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ActivitiesService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new ActivitiesService(prisma as any); });

  it('list filters by contactId + type and sorts occurredAt desc', async () => {
    await service.list('p1', { contactId: 'c1', type: 'CALL' });
    const arg = prisma.activity.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ projectId: 'p1', contactId: 'c1', type: 'CALL' });
    expect(arg.orderBy).toEqual({ occurredAt: 'desc' });
  });

  it('create sets projectId + scopes; defaults occurredAt absent → not forced', async () => {
    const res = await service.create('p1', { type: 'NOTE', body: 'hi', contactId: 'c1' });
    const data = prisma.activity.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'p1', type: 'NOTE', body: 'hi', contactId: 'c1' });
    expect(res.id).toBe('a1');
  });

  it('update/remove are project-scoped (NotFound when foreign)', async () => {
    prisma.activity.findFirst.mockResolvedValue(null);
    await expect(service.update('p1', 'x', { body: 'b' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('p1', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
