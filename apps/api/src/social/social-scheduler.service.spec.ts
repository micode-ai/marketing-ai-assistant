import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SocialSchedulerService } from './social-scheduler.service';
import { SocialService } from './social.service';
import { PrismaService } from '../database/prisma.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';

const mockPrisma = {
  contentPublication: { findMany: jest.fn(), updateMany: jest.fn() },
  content: { update: jest.fn() },
};
const mockSocial = { publishToAccount: jest.fn() };
const mockNotifier = { report: jest.fn().mockResolvedValue(undefined) };
const mockConfig = { get: jest.fn().mockReturnValue('https://app.example.com') };

describe('SocialSchedulerService.processDue', () => {
  let svc: SocialSchedulerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SocialSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SocialService, useValue: mockSocial },
        { provide: CronFailureNotifier, useValue: mockNotifier },
        { provide: ConfigService, useValue: mockConfig },
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
      {
        id: 'pub2',
        platform: 'TWITTER',
        content: { id: 'c2', projectId: 'proj1' },
        socialAccount: { id: 'a2', platform: 'TWITTER', accountName: 'x', organizationId: 'org1', encryptedTokens: '{}' },
      },
    ]);
    mockSocial.publishToAccount.mockResolvedValue({ status: 'FAILED', error: 'boom' });

    await svc.processDue();

    expect(mockPrisma.contentPublication.updateMany).toHaveBeenCalledWith({
      where: { id: 'pub2', status: 'PENDING' },
      data: expect.objectContaining({ status: 'FAILED', error: 'boom' }),
    });
    expect(mockPrisma.content.update).not.toHaveBeenCalled();
    expect(mockNotifier.report).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org1',
        cronName: 'social-scheduler',
        errorCode: 'PUBLISH_FAILED',
        resourceType: 'ContentPublication',
        resourceId: 'pub2',
      }),
    );
  });

  it('does NOT re-notify when FB reauth message surfaces (already reported by SocialService)', async () => {
    mockPrisma.contentPublication.findMany.mockResolvedValue([
      {
        id: 'pub3',
        platform: 'FACEBOOK',
        content: { id: 'c3', projectId: 'proj1' },
        socialAccount: { id: 'a3', platform: 'FACEBOOK', accountName: 'fb', organizationId: 'org1', encryptedTokens: '{}' },
      },
    ]);
    mockSocial.publishToAccount.mockResolvedValue({
      status: 'FAILED',
      error: 'Account requires reauthentication',
    });

    await svc.processDue();

    expect(mockNotifier.report).not.toHaveBeenCalled();
  });

  it('skips when already processing (re-entrancy guard)', async () => {
    (svc as any).processing = true;
    await svc.processDue();
    expect(mockPrisma.contentPublication.findMany).not.toHaveBeenCalled();
  });
});
