import { Test, TestingModule } from '@nestjs/testing';
import { SocialSchedulerService } from './social-scheduler.service';
import { SocialService } from './social.service';
import { PrismaService } from '../database/prisma.service';

const mockPrisma = {
  contentPublication: { findMany: jest.fn(), updateMany: jest.fn() },
  content: { update: jest.fn() },
};
const mockSocial = { publishToAccount: jest.fn() };

describe('SocialSchedulerService.processDue', () => {
  let svc: SocialSchedulerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SocialSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SocialService, useValue: mockSocial },
      ],
    }).compile();
    svc = mod.get(SocialSchedulerService);
  });

  it('publishes due rows and marks them PUBLISHED with race-safe filter', async () => {
    mockPrisma.contentPublication.findMany.mockResolvedValue([
      { id: 'pub1', platform: 'LINKEDIN', content: { id: 'c1', body: 'hi', mediaUrls: [] }, socialAccount: { id: 'a1', platform: 'LINKEDIN', encryptedTokens: '{}' } },
    ]);
    mockSocial.publishToAccount.mockResolvedValue({ status: 'PUBLISHED', platformPostId: 'p1', platformPostUrl: 'https://x/p1' });

    await svc.processDue();

    expect(mockPrisma.contentPublication.updateMany).toHaveBeenCalledWith({
      where: { id: 'pub1', status: 'PENDING' },
      data: expect.objectContaining({ status: 'PUBLISHED', platformPostId: 'p1', platformPostUrl: 'https://x/p1' }),
    });
    expect(mockPrisma.content.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: 'PUBLISHED' }),
    });
  });

  it('marks FAILED on strategy error, leaves Content.status alone', async () => {
    mockPrisma.contentPublication.findMany.mockResolvedValue([
      { id: 'pub2', platform: 'TWITTER', content: { id: 'c2' }, socialAccount: { id: 'a2', platform: 'TWITTER', encryptedTokens: '{}' } },
    ]);
    mockSocial.publishToAccount.mockResolvedValue({ status: 'FAILED', error: 'boom' });

    await svc.processDue();

    expect(mockPrisma.contentPublication.updateMany).toHaveBeenCalledWith({
      where: { id: 'pub2', status: 'PENDING' },
      data: expect.objectContaining({ status: 'FAILED', error: 'boom' }),
    });
    expect(mockPrisma.content.update).not.toHaveBeenCalled();
  });

  it('skips when already processing (re-entrancy guard)', async () => {
    (svc as any).processing = true;
    await svc.processDue();
    expect(mockPrisma.contentPublication.findMany).not.toHaveBeenCalled();
  });
});
