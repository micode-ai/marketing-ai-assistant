import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ContentService } from './content.service';
import { PrismaService } from '../database/prisma.service';

const mockPrisma: any = {
  project: { findUnique: jest.fn() },
  content: { create: jest.fn(), findMany: jest.fn() },
  socialAccount: { findMany: jest.fn() },
  contentPublication: {
    createMany: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),  // dedupe lookup — default to "no duplicates"
  },
  $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
};

describe('ContentService.create — scheduled', () => {
  let service: ContentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.contentPublication.findMany.mockResolvedValue([]);
    const mod: TestingModule = await Test.createTestingModule({
      providers: [ContentService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = mod.get(ContentService);
    mockPrisma.project.findUnique.mockResolvedValue({ organizationId: 'org1' });
  });

  it('rejects when scheduledAt is in the past', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await expect(
      service.create({
        projectId: 'p1', type: 'SOCIAL_POST', title: 't', body: 'b',
        scheduledAt: past as any, scheduledPublicationAccountIds: ['acc1'],
      } as any, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when scheduledAt is set without accountIds', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    await expect(
      service.create({
        projectId: 'p1', type: 'SOCIAL_POST', title: 't', body: 'b',
        scheduledAt: future as any,
      } as any, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects accountIds not attached to the project', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    mockPrisma.socialAccount.findMany.mockResolvedValue([{ id: 'acc1', platform: 'LINKEDIN', language: 'en' }]);
    await expect(
      service.create({
        projectId: 'p1', type: 'SOCIAL_POST', title: 't', body: 'b',
        scheduledAt: future as any, scheduledPublicationAccountIds: ['acc1', 'acc-not-attached'],
      } as any, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets status=SCHEDULED and creates one PENDING publication per account', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    mockPrisma.socialAccount.findMany.mockResolvedValue([
      { id: 'acc1', platform: 'LINKEDIN', language: 'en' },
      { id: 'acc2', platform: 'TWITTER', language: 'pl' },
    ]);
    mockPrisma.content.create.mockResolvedValue({ id: 'ct1', language: 'en', contentGroupId: null });
    mockPrisma.content.findMany.mockResolvedValue([{ id: 'ct1', language: 'en', contentGroupId: null }]);

    await service.create({
      projectId: 'p1', type: 'SOCIAL_POST', title: 't', body: 'b', language: 'en',
      scheduledAt: future as any, scheduledPublicationAccountIds: ['acc1', 'acc2'],
    } as any, 'u1');

    expect(mockPrisma.content.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SCHEDULED' }),
    }));
    expect(mockPrisma.contentPublication.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ contentId: 'ct1', socialAccountId: 'acc1', platform: 'LINKEDIN', status: 'PENDING' }),
        expect.objectContaining({ contentId: 'ct1', socialAccountId: 'acc2', platform: 'TWITTER', status: 'PENDING' }),
      ]),
    });
  });

  it('creates non-scheduled content without touching publication tables', async () => {
    mockPrisma.content.create.mockResolvedValue({ id: 'ct1', language: 'en', contentGroupId: null });
    await service.create({
      projectId: 'p1', type: 'SOCIAL_POST', title: 't', body: 'b', language: 'en',
      // no scheduledAt, no scheduledPublicationAccountIds
    } as any, 'u1');

    // status is left undefined (Prisma default DRAFT applies)
    expect(mockPrisma.content.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: undefined }),
    }));
    expect(mockPrisma.contentPublication.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.contentPublication.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.socialAccount.findMany).not.toHaveBeenCalled();
  });
});

describe('ContentService.update — scheduling reconciliation', () => {
  let service: ContentService;
  const mp: any = {
    project: { findUnique: jest.fn() },
    content: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    contentVersion: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
    socialAccount: { findMany: jest.fn() },
    contentPublication: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (cb: any) => cb(mp)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mp.contentPublication.findMany.mockResolvedValue([]);
    const mod: TestingModule = await Test.createTestingModule({
      providers: [ContentService, { provide: PrismaService, useValue: mp }],
    }).compile();
    service = mod.get(ContentService);
  });

  it('enables schedule (off → on): creates PENDING rows and sets SCHEDULED', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    mp.content.findUnique.mockResolvedValue({ id: 'c1', status: 'DRAFT', body: 'b', projectId: 'p1', organizationId: 'org1', contentGroupId: null, language: 'en' });
    mp.socialAccount.findMany.mockResolvedValue([{ id: 'acc1', platform: 'LINKEDIN', language: 'en' }]);
    mp.content.findMany.mockResolvedValue([{ id: 'c1', language: 'en' }]);
    mp.content.update.mockResolvedValue({ id: 'c1' });

    await service.update('c1', { scheduleEnabled: true, scheduledAt: future as any, scheduledPublicationAccountIds: ['acc1'] } as any, 'u1');

    expect(mp.contentPublication.deleteMany).toHaveBeenCalledWith({ where: { contentId: 'c1', status: 'PENDING' } });
    expect(mp.contentPublication.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ contentId: 'c1', socialAccountId: 'acc1', status: 'PENDING' }),
      ]),
    });
    expect(mp.content.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: 'SCHEDULED', scheduledAt: future }),
    }));
  });

  it('disables schedule (on → off): deletes PENDING rows, clears scheduledAt, resets DRAFT', async () => {
    mp.content.findUnique.mockResolvedValue({ id: 'c1', status: 'SCHEDULED', body: 'b', projectId: 'p1', organizationId: 'org1' });
    mp.content.update.mockResolvedValue({ id: 'c1' });

    await service.update('c1', { scheduleEnabled: false } as any, 'u1');

    expect(mp.contentPublication.deleteMany).toHaveBeenCalledWith({ where: { contentId: 'c1', status: 'PENDING' } });
    expect(mp.content.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c1' },
      data: expect.objectContaining({ scheduledAt: null, status: 'DRAFT' }),
    }));
  });

  it('rejects enabling schedule when content is already PUBLISHED', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    mp.content.findUnique.mockResolvedValue({ id: 'c1', status: 'PUBLISHED', body: 'b', projectId: 'p1', organizationId: 'org1' });
    await expect(service.update('c1', { scheduleEnabled: true, scheduledAt: future as any, scheduledPublicationAccountIds: ['acc1'] } as any, 'u1'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects scheduleEnabled=true without scheduledAt', async () => {
    mp.content.findUnique.mockResolvedValue({ id: 'c1', status: 'DRAFT', body: 'b', projectId: 'p1', organizationId: 'org1' });
    await expect(service.update('c1', { scheduleEnabled: true, scheduledPublicationAccountIds: ['acc1'] } as any, 'u1'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not touch schedule when scheduleEnabled is absent', async () => {
    mp.content.findUnique.mockResolvedValue({ id: 'c1', status: 'DRAFT', body: 'old', projectId: 'p1', organizationId: 'org1' });
    mp.content.update.mockResolvedValue({ id: 'c1' });
    await service.update('c1', { title: 'new title' } as any, 'u1');
    expect(mp.contentPublication.deleteMany).not.toHaveBeenCalled();
    expect(mp.contentPublication.createMany).not.toHaveBeenCalled();
    expect(mp.content.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ status: expect.anything(), scheduledAt: expect.anything() }),
    }));
  });
});
