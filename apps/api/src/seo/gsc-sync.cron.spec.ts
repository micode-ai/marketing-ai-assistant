import { Test, TestingModule } from '@nestjs/testing';
import { GscSyncCronService } from './gsc-sync.cron';
import { PrismaService } from '../database/prisma.service';
import { GscSyncService } from './gsc-sync.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';
import { ConfigService } from '@nestjs/config';

const PROJECT_ID = 'proj-1';
const ORG_ID = 'org-1';

function makeProject(plan: string, siteUrl: string | null) {
  const config = { type: 'gsc', accessToken: 'tok', siteUrl };
  return {
    id: PROJECT_ID,
    name: 'Test Project',
    apiKeys: [
      {
        id: 'key-1',
        platform: 'GOOGLE',
        encryptedKey: Buffer.from(JSON.stringify(config)).toString('base64'),
      },
    ],
    organization: {
      id: ORG_ID,
      name: 'Test Org',
      plan,
    },
  };
}

const mockPrisma = {
  project: { findMany: jest.fn() },
};

const mockGscSync = {
  syncProject: jest.fn(),
};

const mockCronFailureNotifier = {
  report: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('http://localhost:5173'),
};

describe('GscSyncCronService', () => {
  let service: GscSyncCronService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GscSyncCronService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GscSyncService, useValue: mockGscSync },
        { provide: CronFailureNotifier, useValue: mockCronFailureNotifier },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<GscSyncCronService>(GscSyncCronService);
  });

  // ---------------------------------------------------------------------------
  // PRO plan: runs every day
  // ---------------------------------------------------------------------------

  it('runs sync for PRO plan project on any day', async () => {
    mockPrisma.project.findMany.mockResolvedValue([makeProject('PRO', 'https://example.com/')]);
    mockGscSync.syncProject.mockResolvedValue({ synced: 3, matched: 2, skipped: [] });

    // Wednesday (3)
    const wednesday = new Date('2026-04-22T03:00:00Z');
    await service.run(wednesday);

    expect(mockGscSync.syncProject).toHaveBeenCalledTimes(1);
    expect(mockGscSync.syncProject).toHaveBeenCalledWith(PROJECT_ID);
  });

  // ---------------------------------------------------------------------------
  // ENTERPRISE plan: runs every day
  // ---------------------------------------------------------------------------

  it('runs sync for ENTERPRISE plan project on any day', async () => {
    mockPrisma.project.findMany.mockResolvedValue([makeProject('ENTERPRISE', 'https://example.com/')]);
    mockGscSync.syncProject.mockResolvedValue({ synced: 1, matched: 1, skipped: [] });

    const saturday = new Date('2026-04-25T03:00:00Z');
    await service.run(saturday);

    expect(mockGscSync.syncProject).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // FREE plan: runs only on Mondays
  // ---------------------------------------------------------------------------

  it('skips FREE plan project on non-Monday', async () => {
    mockPrisma.project.findMany.mockResolvedValue([makeProject('FREE', 'https://example.com/')]);

    // Wednesday (3)
    const wednesday = new Date('2026-04-22T03:00:00Z');
    await service.run(wednesday);

    expect(mockGscSync.syncProject).not.toHaveBeenCalled();
  });

  it('runs FREE plan project on Monday', async () => {
    mockPrisma.project.findMany.mockResolvedValue([makeProject('FREE', 'https://example.com/')]);
    mockGscSync.syncProject.mockResolvedValue({ synced: 2, matched: 1, skipped: ['kw:NO_MATCH_IN_GSC'] });

    // Monday (1) — April 20, 2026 is a Monday
    const monday = new Date('2026-04-20T03:00:00Z');
    await service.run(monday);

    expect(mockGscSync.syncProject).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Projects without siteUrl are skipped
  // ---------------------------------------------------------------------------

  it('skips projects without siteUrl in config', async () => {
    mockPrisma.project.findMany.mockResolvedValue([makeProject('PRO', null)]);

    await service.run(new Date('2026-04-22T03:00:00Z'));

    expect(mockGscSync.syncProject).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Errors are reported via CronFailureNotifier and execution continues
  // ---------------------------------------------------------------------------

  it('reports sync errors via CronFailureNotifier and continues', async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      makeProject('PRO', 'https://example.com/'),
    ]);
    mockGscSync.syncProject.mockRejectedValue(new Error('GSC quota exceeded'));
    mockCronFailureNotifier.report.mockResolvedValue(undefined);

    const wednesday = new Date('2026-04-22T03:00:00Z');
    await expect(service.run(wednesday)).resolves.not.toThrow();

    expect(mockCronFailureNotifier.report).toHaveBeenCalledWith(
      expect.objectContaining({
        cronName: 'gsc-sync',
        resourceType: 'PROJECT',
        resourceId: PROJECT_ID,
        organizationId: ORG_ID,
      }),
    );
  });
});
