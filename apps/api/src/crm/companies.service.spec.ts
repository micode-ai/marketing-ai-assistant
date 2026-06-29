import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CompaniesService } from './companies.service';

function makePrisma() {
  return {
    company: {
      findMany: jest.fn().mockResolvedValue([{ id: 'co1', name: 'Acme', _count: { contacts: 3 } }]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'co1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'co1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'co1' }),
    },
  };
}

describe('CompaniesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: CompaniesService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new CompaniesService(prisma as any); });

  it('list returns items with contact counts + total', async () => {
    const res = await service.list('p1', {});
    expect(res.total).toBe(1);
    expect(res.items[0]._count.contacts).toBe(3);
    expect(prisma.company.findMany.mock.calls[0][0].where).toEqual({ projectId: 'p1' });
  });

  it('create scopes to project', async () => {
    const res = await service.create('p1', { name: 'Acme', domain: 'acme.com' });
    expect(prisma.company.create.mock.calls[0][0].data).toMatchObject({ projectId: 'p1', name: 'Acme', domain: 'acme.com' });
    expect(res.id).toBe('co1');
  });

  it('create throws ConflictException on a duplicate (projectId,domain) — Prisma P2002', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    prisma.company.create.mockRejectedValue(p2002);

    await expect(service.create('p1', { name: 'Acme', domain: 'acme.com' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('get throws NotFound when missing/foreign', async () => {
    prisma.company.findFirst.mockResolvedValue(null);
    await expect(service.get('p1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
