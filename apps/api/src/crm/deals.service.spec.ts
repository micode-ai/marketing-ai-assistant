import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DealsService } from './deals.service';

function makePrisma() {
  return {
    project: { findUnique: jest.fn().mockResolvedValue({ organizationId: 'org_1', baseCurrency: 'USD' }) },
    organization: { findUnique: jest.fn().mockResolvedValue({ subscription: { plan: 'PRO' } }) },
    deal: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'd1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'd1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'd1' }),
    },
  };
}
const pipeline = { firstStageId: jest.fn().mockResolvedValue('s1') };

describe('DealsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: DealsService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new DealsService(prisma as any, pipeline as any); });

  it('create sets OPEN status, default first stage, project currency, and is project-scoped', async () => {
    const res = await service.create('p1', { title: 'Acme deal', value: 1000 });
    const data = prisma.deal.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'p1', title: 'Acme deal', value: 1000, status: 'OPEN', stageId: 's1', currency: 'USD' });
    expect(res.id).toBe('d1');
  });

  it('create enforces the plan cap counting OPEN deals only (ForbiddenException)', async () => {
    prisma.organization.findUnique.mockResolvedValue({ subscription: { plan: 'FREE' } });
    prisma.deal.count.mockResolvedValue(50); // FREE cap
    await expect(service.create('p1', { title: 'x', value: 0 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.deal.count).toHaveBeenCalledWith({ where: { projectId: 'p1', status: 'OPEN' } });
  });

  it('list applies status/stage/owner/search filters', async () => {
    prisma.deal.findMany.mockResolvedValue([{ id: 'd1' }]);
    await service.list('p1', { status: 'OPEN', stageId: 's1', ownerId: 'u1', search: 'acme' });
    const where = prisma.deal.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ projectId: 'p1', status: 'OPEN', stageId: 's1', ownerId: 'u1' });
    expect(where.title).toEqual({ contains: 'acme', mode: 'insensitive' });
  });

  it('forecast computes weighted = sum(value * probability/100) over OPEN deals (no-stage → 0)', async () => {
    prisma.deal.findMany.mockResolvedValue([
      { value: 1000, status: 'OPEN', stage: { probability: 50 } },
      { value: 400, status: 'OPEN', stage: { probability: 25 } },
      { value: 999, status: 'OPEN', stage: null },
    ]);
    prisma.deal.count.mockResolvedValue(3);
    const f = await service.forecast('p1');
    expect(f.weightedValue).toBe(600); // 1000*.5 + 400*.25 + 0
    expect(f.openValue).toBe(2399);
    expect(f.openCount).toBe(3);
  });

  it('update only writes provided fields; remove is project-scoped (NotFound when foreign)', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'OPEN', financeRecordId: null });
    await service.update('p1', 'd1', { title: 'new' });
    expect(prisma.deal.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { title: 'new' } });
    prisma.deal.findFirst.mockResolvedValue(null);
    await expect(service.remove('p1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
