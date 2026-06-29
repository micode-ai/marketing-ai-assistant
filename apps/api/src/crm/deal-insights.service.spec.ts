import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DealInsightsService } from './deal-insights.service';

function makePrisma() {
  return {
    deal: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'd1', projectId: 'p1', title: 'Acme', value: 5000, currency: 'USD', status: 'OPEN',
        createdAt: new Date(Date.now() - 12 * 86400000),
        stage: { name: 'Proposal', probability: 50 }, contact: { firstName: 'Jane', lastName: 'Doe' },
      }),
    },
    activity: { findMany: jest.fn().mockResolvedValue([{ type: 'CALL', occurredAt: new Date('2026-06-20'), body: 'pricing' }]) },
    task: { count: jest.fn().mockResolvedValue(2) },
    dealInsight: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 'i1', ...create })),
    },
  };
}

describe('DealInsightsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: DealInsightsService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new DealInsightsService(prisma as any); });

  it('generate builds context, posts to the agent, clamps + upserts the insight', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ score: 130, scoreReason: 'hot', nextStep: 'call', draftSubject: 'Hi', draftBody: 'body' }),
    }) as any;

    const res = await service.generate('p1', 'd1', 'en');

    const url = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(url).toContain('/deal-insights');
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.language).toBe('en');
    expect(body.deal.title).toBe('Acme');
    expect(body.deal.ageDays).toBeGreaterThanOrEqual(11);
    expect(body.contact.name).toBe('Jane Doe');
    const data = prisma.dealInsight.upsert.mock.calls[0][0];
    expect(data.where).toEqual({ dealId: 'd1' });
    expect(data.create.score).toBe(100); // clamped
    expect(res.id).toBe('i1');
  });

  it('generate throws NotFound for a deal in another project', async () => {
    prisma.deal.findFirst.mockResolvedValue(null);
    await expect(service.generate('p1', 'x', 'en')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('generate throws BadRequest + does NOT upsert when the agent fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    await expect(service.generate('p1', 'd1', 'en')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.dealInsight.upsert).not.toHaveBeenCalled();
  });

  it('get returns the persisted insight, project-scoped', async () => {
    prisma.dealInsight.findUnique.mockResolvedValue({ id: 'i1', dealId: 'd1', score: 80 });
    const res = await service.get('p1', 'd1');
    expect(res).toMatchObject({ id: 'i1', score: 80 });
    prisma.deal.findFirst.mockResolvedValue(null);
    await expect(service.get('p1', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
