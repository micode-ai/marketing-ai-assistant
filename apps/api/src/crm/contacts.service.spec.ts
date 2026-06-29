import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ContactsService } from './contacts.service';

function makePrisma() {
  return {
    project: { findUnique: jest.fn().mockResolvedValue({ organizationId: 'org_1' }) },
    organization: { findUnique: jest.fn().mockResolvedValue({ subscription: { plan: 'PRO' } }) },
    contact: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'c1' }),
    },
    company: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'co1', name: 'Acme' }),
    },
  };
}

describe('ContactsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ContactsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new ContactsService(prisma as any);
  });

  it('list applies search + status + tag + owner filters and paginates', async () => {
    prisma.contact.count.mockResolvedValue(1);
    prisma.contact.findMany.mockResolvedValue([{ id: 'c1' }]);

    const res = await service.list('p1', { page: 2, pageSize: 10, search: 'ann', status: 'ACTIVE', tag: 'vip', ownerId: 'u1' });

    expect(res).toMatchObject({ total: 1, page: 2, pageSize: 10 });
    const where = prisma.contact.findMany.mock.calls[0][0].where;
    expect(where.projectId).toBe('p1');
    expect(where.status).toBe('ACTIVE');
    expect(where.tags).toEqual({ has: 'vip' });
    expect(where.ownerId).toBe('u1');
    expect(where.OR).toBeDefined(); // search across email/first/last
    expect(prisma.contact.findMany.mock.calls[0][0].skip).toBe(10); // (page-1)*pageSize
    expect(prisma.contact.findMany.mock.calls[0][0].take).toBe(10);
  });

  it('create enforces the plan cap (ForbiddenException when full)', async () => {
    prisma.organization.findUnique.mockResolvedValue({ subscription: { plan: 'FREE' } });
    prisma.contact.count.mockResolvedValue(100); // FREE cap

    await expect(service.create('p1', { email: 'a@x.com' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('create sets source MANUAL and scopes to project', async () => {
    const res = await service.create('p1', { email: 'a@x.com', firstName: 'A', tags: ['vip'] });
    const data = prisma.contact.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'p1', email: 'a@x.com', source: 'MANUAL', tags: ['vip'] });
    expect(res.id).toBe('c1');
  });

  it('get throws NotFound when the contact is missing or in another project', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);
    await expect(service.get('p1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update/delete are scoped by project (findFirst guard)', async () => {
    prisma.contact.findFirst.mockResolvedValue({ id: 'c1', projectId: 'p1' });
    await service.update('p1', 'c1', { notes: 'hi' });
    expect(prisma.contact.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { notes: 'hi' } });
    const del = await service.remove('p1', 'c1');
    expect(del).toEqual({ deleted: true });
  });
});

describe('ContactsService.importCsv', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ContactsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    prisma.contact.findUnique.mockResolvedValue(null);
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.company.create.mockResolvedValue({ id: 'co1', name: 'Acme' });
    service = new ContactsService(prisma as any);
  });

  it('parses headers case-insensitively, upserts by email with source IMPORT, resolves company by name', async () => {
    const csv = 'Email,FirstName,LastName,Company,Tags\na@x.com,Ann,Lee,Acme,"vip,warm"\n';

    const res = await service.importCsv('p1', 'PRO', csv);

    expect(res).toMatchObject({ created: 1, updated: 0, skipped: 0 });
    const data = prisma.contact.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'p1', email: 'a@x.com', firstName: 'Ann', lastName: 'Lee', source: 'IMPORT', companyId: 'co1' });
    expect(data.tags).toEqual(['vip', 'warm']);
  });

  it('skips rows with no email and no name; collects malformed rows into errors without aborting', async () => {
    const csv = 'email,firstName\n,,\nb@x.com,Bob\n';
    const res = await service.importCsv('p1', 'PRO', csv);
    expect(res.created).toBe(1);     // b@x.com
    expect(res.skipped).toBe(1);     // the empty row
  });
});
