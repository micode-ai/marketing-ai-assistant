import { Test, TestingModule } from '@nestjs/testing';
import { RankTrackingCronService } from './rank-tracking.cron';
import { PrismaService } from '../database/prisma.service';
import { RankTrackingService } from './rank-tracking.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockPrisma = {
  projectApiKey: {
    findMany: jest.fn(),
  },
  keyword: {
    findMany: jest.fn(),
  },
};

const mockRankTracking = {
  checkKeyword: jest.fn(),
};

const mockCronFailure = {
  report: jest.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ProjectApiKey row with project → org → subscription */
function makeIntegration(
  overrides: {
    projectId?: string;
    orgId?: string;
    plan?: string;
    projectName?: string;
    subscriptionPlan?: string | null;
    orgPlan?: string;
  } = {},
) {
  const projectId = overrides.projectId ?? 'proj-1';
  const orgId = overrides.orgId ?? 'org-1';
  const projectName = overrides.projectName ?? 'Test Project';
  const subscriptionPlan = 'subscriptionPlan' in overrides ? overrides.subscriptionPlan : 'FREE';
  const orgPlan = overrides.orgPlan ?? 'FREE';

  return {
    id: 'key-1',
    projectId,
    platform: 'BRAVE_SEARCH',
    project: {
      id: projectId,
      name: projectName,
      organization: {
        id: orgId,
        plan: orgPlan,
        subscription: subscriptionPlan != null ? { plan: subscriptionPlan } : null,
      },
    },
  };
}

/** Build a minimal keyword row */
function makeKeyword(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    keyword: `keyword-${id}`,
    projectId: 'proj-1',
    isTracking: true,
    url: 'https://example.com',
    createdAt: new Date(),
    ...overrides,
  };
}

/** Monday = UTCDay 1 */
const MONDAY = new Date('2026-01-05T03:00:00Z'); // Monday
const TUESDAY = new Date('2026-01-06T03:00:00Z'); // Tuesday

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('RankTrackingCronService', () => {
  let service: RankTrackingCronService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankTrackingCronService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RankTrackingService, useValue: mockRankTracking },
        { provide: CronFailureNotifier, useValue: mockCronFailure },
      ],
    }).compile();

    service = module.get<RankTrackingCronService>(RankTrackingCronService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // FREE Monday: checks 5 keywords
  // -------------------------------------------------------------------------

  it('FREE Monday: picks up to 5 keywords and calls checkKeyword with source "cron"', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([makeIntegration({ plan: 'FREE' })]);

    const keywords = Array.from({ length: 5 }, (_, i) => makeKeyword(`kw-${i + 1}`));
    mockPrisma.keyword.findMany.mockResolvedValue(keywords);
    mockRankTracking.checkKeyword.mockResolvedValue({ skipped: false, rank: 10 });

    const runPromise = service.run(MONDAY);
    // Advance through all 1100 ms sleep calls (4 between 5 keywords)
    await jest.runAllTimersAsync();
    await runPromise;

    expect(mockPrisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: 'proj-1',
          isTracking: true,
          url: { not: null },
        }),
        orderBy: { createdAt: 'asc' },
        take: 5,
      }),
    );
    expect(mockRankTracking.checkKeyword).toHaveBeenCalledTimes(5);
    keywords.forEach((kw) => {
      expect(mockRankTracking.checkKeyword).toHaveBeenCalledWith(kw.id, 'cron');
    });
  });

  // -------------------------------------------------------------------------
  // FREE Tuesday (non-Monday): skips, 0 calls
  // -------------------------------------------------------------------------

  it('FREE Tuesday: skips — checkKeyword never called', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([makeIntegration({ plan: 'FREE' })]);

    const runPromise = service.run(TUESDAY);
    await jest.runAllTimersAsync();
    await runPromise;

    expect(mockPrisma.keyword.findMany).not.toHaveBeenCalled();
    expect(mockRankTracking.checkKeyword).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // PRO any day: picks up to 30 keywords
  // -------------------------------------------------------------------------

  it('PRO any day (Tuesday): picks up to 30 keywords', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([
      makeIntegration({ subscriptionPlan: 'PRO', orgPlan: 'PRO' }),
    ]);

    const keywords = Array.from({ length: 3 }, (_, i) => makeKeyword(`kw-${i + 1}`));
    mockPrisma.keyword.findMany.mockResolvedValue(keywords);
    mockRankTracking.checkKeyword.mockResolvedValue({ skipped: false, rank: 5 });

    const runPromise = service.run(TUESDAY);
    await jest.runAllTimersAsync();
    await runPromise;

    expect(mockPrisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 30 }),
    );
    expect(mockRankTracking.checkKeyword).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------------------------------------------
  // ENTERPRISE any day: picks up to 90 keywords
  // -------------------------------------------------------------------------

  it('ENTERPRISE any day (Tuesday): picks up to 90 keywords', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([
      makeIntegration({ subscriptionPlan: 'ENTERPRISE', orgPlan: 'ENTERPRISE' }),
    ]);

    const keywords = Array.from({ length: 2 }, (_, i) => makeKeyword(`kw-${i + 1}`));
    mockPrisma.keyword.findMany.mockResolvedValue(keywords);
    mockRankTracking.checkKeyword.mockResolvedValue({ skipped: false, rank: 1 });

    const runPromise = service.run(TUESDAY);
    await jest.runAllTimersAsync();
    await runPromise;

    expect(mockPrisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 90 }),
    );
  });

  // -------------------------------------------------------------------------
  // Filters: isTracking: false and url: null excluded via Prisma query
  // -------------------------------------------------------------------------

  it('query filters out isTracking:false and url:null keywords', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([
      makeIntegration({ subscriptionPlan: 'PRO', orgPlan: 'PRO' }),
    ]);
    mockPrisma.keyword.findMany.mockResolvedValue([]);
    mockRankTracking.checkKeyword.mockResolvedValue({ skipped: false, rank: null });

    const runPromise = service.run(TUESDAY);
    await jest.runAllTimersAsync();
    await runPromise;

    const call = mockPrisma.keyword.findMany.mock.calls[0][0];
    expect(call.where.isTracking).toBe(true);
    expect(call.where.url).toEqual({ not: null });
  });

  // -------------------------------------------------------------------------
  // 1100 ms delay between calls (Brave free tier: 1 req/s)
  // -------------------------------------------------------------------------

  it('waits 1100 ms between consecutive checkKeyword calls', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([
      makeIntegration({ subscriptionPlan: 'PRO', orgPlan: 'PRO' }),
    ]);

    const keywords = [makeKeyword('kw-a'), makeKeyword('kw-b'), makeKeyword('kw-c')];
    mockPrisma.keyword.findMany.mockResolvedValue(keywords);

    const callTimes: number[] = [];
    mockRankTracking.checkKeyword.mockImplementation(async () => {
      callTimes.push(Date.now());
      return { skipped: false, rank: 1 };
    });

    const runPromise = service.run(TUESDAY);
    await jest.runAllTimersAsync();
    await runPromise;

    expect(mockRankTracking.checkKeyword).toHaveBeenCalledTimes(3);
    // Each consecutive call should be ~1100 ms apart (Brave rate limit)
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(1100);
    expect(callTimes[2] - callTimes[1]).toBeGreaterThanOrEqual(1100);
  });

  // -------------------------------------------------------------------------
  // Individual keyword error does not abort batch
  // -------------------------------------------------------------------------

  it('individual keyword error: logs warn but continues batch; cronFailure.report NOT called', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([
      makeIntegration({ subscriptionPlan: 'PRO', orgPlan: 'PRO' }),
    ]);

    const keywords = [makeKeyword('kw-1'), makeKeyword('kw-2'), makeKeyword('kw-3')];
    mockPrisma.keyword.findMany.mockResolvedValue(keywords);

    // First keyword throws; second and third succeed
    mockRankTracking.checkKeyword
      .mockRejectedValueOnce(new Error('CSE error on first keyword'))
      .mockResolvedValueOnce({ skipped: false, rank: 5 })
      .mockResolvedValueOnce({ skipped: false, rank: 10 });

    const runPromise = service.run(TUESDAY);
    await jest.runAllTimersAsync();
    await runPromise;

    expect(mockRankTracking.checkKeyword).toHaveBeenCalledTimes(3);
    expect(mockCronFailure.report).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Unknown plan: falls back to FREE limits
  // -------------------------------------------------------------------------

  it('unknown plan value falls back to FREE limits (weekly, 5 keywords)', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([
      makeIntegration({ subscriptionPlan: 'UNKNOWN_PLAN', orgPlan: 'UNKNOWN_PLAN' }),
    ]);

    const runPromise = service.run(TUESDAY); // not Monday → skip
    await jest.runAllTimersAsync();
    await runPromise;

    // Unknown plan falls back to FREE (weekly) → Tuesday is skipped
    expect(mockPrisma.keyword.findMany).not.toHaveBeenCalled();
    expect(mockRankTracking.checkKeyword).not.toHaveBeenCalled();
  });

  it('unknown plan falls back to FREE — runs on Monday with cap 5', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([
      makeIntegration({ subscriptionPlan: 'WEIRD', orgPlan: 'WEIRD' }),
    ]);
    mockPrisma.keyword.findMany.mockResolvedValue([]);

    const runPromise = service.run(MONDAY);
    await jest.runAllTimersAsync();
    await runPromise;

    expect(mockPrisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  // -------------------------------------------------------------------------
  // Missing subscription: treated as FREE
  // -------------------------------------------------------------------------

  it('missing subscription: uses org.plan (FREE) — weekly, skip on Tuesday', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([
      makeIntegration({ subscriptionPlan: null, orgPlan: 'FREE' }),
    ]);

    const runPromise = service.run(TUESDAY);
    await jest.runAllTimersAsync();
    await runPromise;

    expect(mockPrisma.keyword.findMany).not.toHaveBeenCalled();
  });

  it('missing subscription AND org.plan missing: falls back to FREE — skip on Tuesday', async () => {
    const integration = makeIntegration({ subscriptionPlan: null, orgPlan: undefined as any });
    // Remove org.plan to simulate truly missing field
    delete (integration.project.organization as any).plan;

    mockPrisma.projectApiKey.findMany.mockResolvedValue([integration]);

    const runPromise = service.run(TUESDAY);
    await jest.runAllTimersAsync();
    await runPromise;

    expect(mockPrisma.keyword.findMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Batch-level error → cronFailure.report IS called
  // -------------------------------------------------------------------------

  it('batch-level error (prisma.keyword.findMany throws): calls cronFailure.report with correct args', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([
      makeIntegration({ subscriptionPlan: 'PRO', orgPlan: 'PRO', projectId: 'proj-err', orgId: 'org-err' }),
    ]);

    const batchError = new Error('DB connection failed');
    mockPrisma.keyword.findMany.mockRejectedValue(batchError);
    mockCronFailure.report.mockResolvedValue(undefined);

    const runPromise = service.run(TUESDAY);
    await jest.runAllTimersAsync();
    await runPromise;

    expect(mockCronFailure.report).toHaveBeenCalledTimes(1);
    expect(mockCronFailure.report).toHaveBeenCalledWith(
      expect.objectContaining({
        cronName: 'rank-tracking',
        resourceType: 'PROJECT',
        resourceId: 'proj-err',
        organizationId: 'org-err',
        errorCode: 'RANK_TRACKING_ERROR',
      }),
    );
  });

  it('batch-level error with BRAVE_QUOTA_EXCEEDED in message: errorCode is BRAVE_QUOTA_EXCEEDED', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([
      makeIntegration({ subscriptionPlan: 'PRO', orgPlan: 'PRO' }),
    ]);

    mockPrisma.keyword.findMany.mockRejectedValue(new Error('BRAVE_QUOTA_EXCEEDED limit hit'));
    mockCronFailure.report.mockResolvedValue(undefined);

    const runPromise = service.run(TUESDAY);
    await jest.runAllTimersAsync();
    await runPromise;

    expect(mockCronFailure.report).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'BRAVE_QUOTA_EXCEEDED' }),
    );
  });

  it('batch-level error with BRAVE_INVALID_KEY in message: errorCode is BRAVE_INVALID_KEY', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([
      makeIntegration({ subscriptionPlan: 'PRO', orgPlan: 'PRO' }),
    ]);

    mockPrisma.keyword.findMany.mockRejectedValue(new Error('BRAVE_INVALID_KEY provided'));
    mockCronFailure.report.mockResolvedValue(undefined);

    const runPromise = service.run(TUESDAY);
    await jest.runAllTimersAsync();
    await runPromise;

    expect(mockCronFailure.report).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'BRAVE_INVALID_KEY' }),
    );
  });

  // -------------------------------------------------------------------------
  // Multiple integrations: per-project isolation
  // -------------------------------------------------------------------------

  it('processes multiple integrations independently', async () => {
    mockPrisma.projectApiKey.findMany.mockResolvedValue([
      makeIntegration({ projectId: 'proj-a', orgId: 'org-a', subscriptionPlan: 'PRO', orgPlan: 'PRO' }),
      makeIntegration({ projectId: 'proj-b', orgId: 'org-b', subscriptionPlan: 'PRO', orgPlan: 'PRO' }),
    ]);

    const kwA = [makeKeyword('kw-a1')];
    const kwB = [makeKeyword('kw-b1')];

    mockPrisma.keyword.findMany
      .mockResolvedValueOnce(kwA)
      .mockResolvedValueOnce(kwB);

    mockRankTracking.checkKeyword.mockResolvedValue({ skipped: false, rank: 1 });

    const runPromise = service.run(TUESDAY);
    await jest.runAllTimersAsync();
    await runPromise;

    expect(mockPrisma.keyword.findMany).toHaveBeenCalledTimes(2);
    expect(mockRankTracking.checkKeyword).toHaveBeenCalledTimes(2);
  });
});
