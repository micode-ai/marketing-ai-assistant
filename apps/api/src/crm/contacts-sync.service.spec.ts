import { ContactsSyncService } from './contacts-sync.service';

function makePrisma() {
  return {
    project: { findUnique: jest.fn().mockResolvedValue({ organizationId: 'org_1' }) },
    organization: {
      findUnique: jest.fn().mockResolvedValue({ subscription: { plan: 'PRO' } }),
    },
    emailSubscriber: { findMany: jest.fn().mockResolvedValue([]) },
    trackedUser: { findMany: jest.fn().mockResolvedValue([]) },
    contact: {
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c', ...data })),
    },
  };
}

describe('ContactsSyncService.materialize', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ContactsSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new ContactsSyncService(prisma as any, { report: jest.fn() } as any);
  });

  it('creates a contact from a subscriber (source SUBSCRIBER)', async () => {
    prisma.emailSubscriber.findMany.mockResolvedValue([
      { id: 's1', email: 'a@x.com', name: 'Ann', status: 'ACTIVE' },
    ]);

    const res = await service.materialize('p1');

    expect(res.created).toBe(1);
    const arg = prisma.contact.create.mock.calls[0][0].data;
    expect(arg).toMatchObject({ projectId: 'p1', email: 'a@x.com', source: 'SUBSCRIBER', emailSubscriberId: 's1', firstName: 'Ann' });
  });

  it('dedups subscriber + tracked-user with the same email into one contact (update, not 2nd create)', async () => {
    prisma.emailSubscriber.findMany.mockResolvedValue([{ id: 's1', email: 'a@x.com', name: 'Ann', status: 'ACTIVE' }]);
    prisma.trackedUser.findMany.mockResolvedValue([
      { id: 't1', email: 'a@x.com', lastSeen: new Date('2026-06-01'), firstUtm: { s: 'g' }, lastUtm: null },
    ]);
    // After the subscriber pass the contact exists:
    prisma.contact.findUnique
      .mockResolvedValueOnce(null) // subscriber lookup → create
      .mockResolvedValueOnce({ id: 'c1', email: 'a@x.com', source: 'SUBSCRIBER', firstName: 'Ann' }); // tracked lookup → update

    const res = await service.materialize('p1');

    expect(prisma.contact.create).toHaveBeenCalledTimes(1);
    expect(prisma.contact.update).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ created: 1, updated: 1 });
  });

  it('never downgrades source: tracked-user pass does not overwrite MANUAL', async () => {
    prisma.trackedUser.findMany.mockResolvedValue([{ id: 't1', email: 'm@x.com', lastSeen: new Date(), firstUtm: null, lastUtm: null }]);
    prisma.contact.findUnique.mockResolvedValue({ id: 'c1', email: 'm@x.com', source: 'MANUAL', firstName: 'Manual Name' });

    await service.materialize('p1');

    const upd = prisma.contact.update.mock.calls[0][0].data;
    expect(upd.source).toBeUndefined();          // source not changed
    expect(upd.firstName).toBeUndefined();        // human name not clobbered
    expect(upd.trackedUserId).toBe('t1');         // snapshot still linked
  });

  it('stops creating once the plan cap is reached (capped=true)', async () => {
    prisma.organization.findUnique.mockResolvedValue({ subscription: { plan: 'FREE' } });
    prisma.contact.count.mockResolvedValue(100); // FREE cap = 100, already full
    prisma.emailSubscriber.findMany.mockResolvedValue([{ id: 's1', email: 'a@x.com', name: 'A', status: 'ACTIVE' }]);

    const res = await service.materialize('p1');

    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(res.capped).toBe(true);
  });

  it('is idempotent: a second run with the same data updates, never re-creates', async () => {
    prisma.emailSubscriber.findMany.mockResolvedValue([{ id: 's1', email: 'a@x.com', name: 'A', status: 'ACTIVE' }]);
    prisma.contact.findUnique.mockResolvedValue({ id: 'c1', email: 'a@x.com', source: 'SUBSCRIBER' });

    const res = await service.materialize('p1');

    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(res.created).toBe(0);
  });
});

describe('ContactsSyncService.handleCron', () => {
  it('materializes each active project and reports per-project failures', async () => {
    const prisma: any = {
      project: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', organizationId: 'org_1', name: 'P1' },
          { id: 'p2', organizationId: 'org_1', name: 'P2' },
        ]),
        findUnique: jest.fn().mockResolvedValue({ organizationId: 'org_1' }),
      },
      organization: { findUnique: jest.fn().mockResolvedValue({ subscription: { plan: 'PRO' } }) },
      emailSubscriber: { findMany: jest.fn().mockResolvedValue([]) },
      trackedUser: { findMany: jest.fn().mockResolvedValue([]) },
      contact: { count: jest.fn().mockResolvedValue(0), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const notifier = { report: jest.fn() };
    const service = new ContactsSyncService(prisma, notifier as any);
    jest.spyOn(service, 'materialize').mockResolvedValueOnce({ created: 0, updated: 0, capped: false })
      .mockRejectedValueOnce(new Error('boom'));

    await service.handleCron();

    expect(service.materialize).toHaveBeenCalledTimes(2);
    expect(notifier.report).toHaveBeenCalledTimes(1); // only the failing project
  });
});
