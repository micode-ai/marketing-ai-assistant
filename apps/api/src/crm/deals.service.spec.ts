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

function makePrismaWithFinance() {
  const base = makePrisma() as any;
  base.financeCategory = {
    findFirst: jest.fn().mockResolvedValue({ id: 'cat_sales' }),
    create: jest.fn().mockResolvedValue({ id: 'cat_new' }),
  };
  base.financeRecord = {
    create: jest.fn().mockResolvedValue({ id: 'fr1' }),
    update: jest.fn().mockResolvedValue({ id: 'fr1' }),
    delete: jest.fn().mockResolvedValue({ id: 'fr1' }),
  };
  base.$transaction = jest.fn(async (cb: any) => cb(base));
  return base;
}

describe('DealsService win/lose/reopen + finance', () => {
  let prisma: any;
  let service: DealsService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrismaWithFinance(); service = new DealsService(prisma, pipeline as any); });

  it('win creates an INCOME FinanceRecord for the deal value and links it', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'OPEN', value: 1500, financeRecordId: null });
    prisma.project.findUnique.mockResolvedValue({ organizationId: 'org_1', baseCurrency: 'EUR' });
    await service.win('p1', 'd1');
    const rec = prisma.financeRecord.create.mock.calls[0][0].data;
    expect(rec).toMatchObject({ projectId: 'p1', categoryId: 'cat_sales', type: 'INCOME', currency: 'EUR', exchangeRate: 1 });
    expect(Number(rec.amount)).toBe(1500);
    expect(Number(rec.amountInBaseCurrency)).toBe(1500);
    // deal updated to WON with the finance link + wonAt
    const upd = prisma.deal.update.mock.calls.find((c: any) => c[0].data.status === 'WON');
    expect(upd[0].data).toMatchObject({ status: 'WON', financeRecordId: 'fr1' });
    expect(upd[0].data.wonAt).toBeInstanceOf(Date);
  });

  it('win is idempotent — a deal already WON does not create a second record', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'WON', value: 1500, financeRecordId: 'fr1' });
    await service.win('p1', 'd1');
    expect(prisma.financeRecord.create).not.toHaveBeenCalled();
  });

  it('reopen removes the linked finance record and clears the link', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'WON', financeRecordId: 'fr1' });
    await service.reopen('p1', 'd1');
    expect(prisma.financeRecord.delete).toHaveBeenCalledWith({ where: { id: 'fr1' } });
    const upd = prisma.deal.update.mock.calls[0][0].data;
    expect(upd).toMatchObject({ status: 'OPEN', financeRecordId: null, wonAt: null });
  });

  it('lose sets LOST + lostAt + reason and books no revenue', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'OPEN', financeRecordId: null });
    await service.lose('p1', 'd1', { lostReason: 'budget' });
    const upd = prisma.deal.update.mock.calls[0][0].data;
    expect(upd).toMatchObject({ status: 'LOST', lostReason: 'budget' });
    expect(prisma.financeRecord.create).not.toHaveBeenCalled();
  });

  it('update re-syncs the finance record amount when a WON deal value changes', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'WON', value: 1000, financeRecordId: 'fr1' });
    await service.update('p1', 'd1', { value: 2000 });
    expect(prisma.financeRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'fr1' }, data: expect.objectContaining({ amount: 2000, amountInBaseCurrency: 2000 }) }),
    );
  });

  it('remove deletes the linked finance record first', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'WON', financeRecordId: 'fr1' });
    await service.remove('p1', 'd1');
    expect(prisma.financeRecord.delete).toHaveBeenCalledWith({ where: { id: 'fr1' } });
    expect(prisma.deal.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
  });
});
