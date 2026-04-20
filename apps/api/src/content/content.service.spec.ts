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
});
