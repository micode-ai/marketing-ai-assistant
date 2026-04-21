import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { RankTrackingService, localeToGlHl, hostMatches } from './rank-tracking.service';
import { PrismaService } from '../database/prisma.service';
import { SeoService } from './seo.service';
import { CseConfigService } from './cse-config.service';

// ---------------------------------------------------------------------------
// Mock googleapis
// ---------------------------------------------------------------------------

const mockCseList = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    customsearch: jest.fn(() => ({
      cse: { list: mockCseList },
    })),
  },
}));

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockPrisma = {
  keyword: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockSeo = {
  addRankHistory: jest.fn(),
};

const mockCseConfig = {
  getCredentials: jest.fn(),
  markValidationError: jest.fn(),
  clearValidationError: jest.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKeyword(overrides: Record<string, unknown> = {}) {
  return {
    id: 'kw-1',
    keyword: 'seo tool',
    projectId: 'proj-1',
    organizationId: 'org-1',
    isTracking: true,
    url: 'https://example.com/seo',
    locale: 'en-US',
    lastCheckedAt: null,
    lastCheckError: null,
    currentRank: null,
    ...overrides,
  };
}

/** Builds a minimal CSE page response with the given link hostnames */
function makeCseResponse(links: string[]) {
  return {
    data: {
      items: links.map((link) => ({ link })),
    },
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('RankTrackingService', () => {
  let service: RankTrackingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankTrackingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SeoService, useValue: mockSeo },
        { provide: CseConfigService, useValue: mockCseConfig },
      ],
    }).compile();

    service = module.get<RankTrackingService>(RankTrackingService);
  });

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------

  it('throws NotFoundException when keyword does not exist', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(null);

    await expect(service.checkKeyword('missing-id')).rejects.toThrow(NotFoundException);
  });

  // -------------------------------------------------------------------------
  // Skip: isTracking === false
  // -------------------------------------------------------------------------

  it('skips when isTracking is false — no Google call, no DB write', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ isTracking: false }));

    const result = await service.checkKeyword('kw-1');

    expect(result).toEqual({ skipped: true, reason: 'NOT_TRACKING' });
    expect(mockCseList).not.toHaveBeenCalled();
    expect(mockPrisma.keyword.update).not.toHaveBeenCalled();
    expect(mockSeo.addRankHistory).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Skip: org-scoped keyword (projectId === null)
  // -------------------------------------------------------------------------

  it('skips org-scoped keywords with ORG_SCOPED_NOT_SUPPORTED — no DB write', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ projectId: null }));

    const result = await service.checkKeyword('kw-1');

    expect(result).toEqual({ skipped: true, reason: 'ORG_SCOPED_NOT_SUPPORTED' });
    expect(mockPrisma.keyword.update).not.toHaveBeenCalled();
    expect(mockSeo.addRankHistory).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Skip: no target URL
  // -------------------------------------------------------------------------

  it('skips and sets NO_TARGET_URL error when keyword.url is missing', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ url: null }));
    mockPrisma.keyword.update.mockResolvedValue({});

    const result = await service.checkKeyword('kw-1');

    expect(result).toEqual({ skipped: true, reason: 'NO_TARGET_URL' });
    expect(mockPrisma.keyword.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'kw-1' },
        data: expect.objectContaining({ lastCheckError: 'NO_TARGET_URL' }),
      }),
    );
    expect(mockCseList).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Skip: CSE credentials not configured
  // -------------------------------------------------------------------------

  it('skips and sets CSE_NOT_CONFIGURED when credentials are missing', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword());
    mockCseConfig.getCredentials.mockResolvedValue(null);
    mockPrisma.keyword.update.mockResolvedValue({});

    const result = await service.checkKeyword('kw-1');

    expect(result).toEqual({ skipped: true, reason: 'CSE_NOT_CONFIGURED' });
    expect(mockPrisma.keyword.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'kw-1' },
        data: expect.objectContaining({ lastCheckError: 'CSE_NOT_CONFIGURED' }),
      }),
    );
    expect(mockCseList).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Successful rank: match on 3rd result (rank 3)
  // -------------------------------------------------------------------------

  it('finds rank 3 when 3rd result matches the target host', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ url: 'https://example.com/page' }));
    mockCseConfig.getCredentials.mockResolvedValue({ apiKey: 'key-123', cseId: 'cx-abc' });
    mockSeo.addRankHistory.mockResolvedValue({});
    mockPrisma.keyword.update.mockResolvedValue({});

    // First page: 10 results, match is index 2 (rank 3)
    mockCseList.mockResolvedValueOnce(
      makeCseResponse([
        'https://other1.com/foo',
        'https://other2.com/bar',
        'https://example.com/different-page',
        'https://other3.com/',
        'https://other4.com/',
        'https://other5.com/',
        'https://other6.com/',
        'https://other7.com/',
        'https://other8.com/',
        'https://other9.com/',
      ]),
    );

    const result = await service.checkKeyword('kw-1');

    expect(result).toEqual({ skipped: false, rank: 3 });
    expect(mockSeo.addRankHistory).toHaveBeenCalledWith('kw-1', 3, 'https://example.com/page');
    expect(mockCseConfig.clearValidationError).toHaveBeenCalledWith('proj-1');
    // Should only have called list once (found on first page)
    expect(mockCseList).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Successful rank: match on 3rd page (rank 23)
  // -------------------------------------------------------------------------

  it('finds rank 23 when match is result index 2 on the third page (start=21)', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ url: 'https://example.com' }));
    mockCseConfig.getCredentials.mockResolvedValue({ apiKey: 'key-123', cseId: 'cx-abc' });
    mockSeo.addRankHistory.mockResolvedValue({});
    mockPrisma.keyword.update.mockResolvedValue({});

    const misses = Array(10).fill('https://other.com/page');

    // Pages 1 and 2 — no match
    mockCseList
      .mockResolvedValueOnce(makeCseResponse(misses))
      .mockResolvedValueOnce(makeCseResponse(misses));

    // Page 3: match at index 2 → rank 21 + 2 = 23
    const page3Links = [
      'https://other1.com/',
      'https://other2.com/',
      'https://example.com/landing',
      'https://other4.com/',
      'https://other5.com/',
      'https://other6.com/',
      'https://other7.com/',
      'https://other8.com/',
      'https://other9.com/',
      'https://other10.com/',
    ];
    mockCseList.mockResolvedValueOnce(makeCseResponse(page3Links));

    const result = await service.checkKeyword('kw-1');

    expect(result).toEqual({ skipped: false, rank: 23 });
    expect(mockSeo.addRankHistory).toHaveBeenCalledWith('kw-1', 23, 'https://example.com');
    // Should stop after 3 pages
    expect(mockCseList).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------------------------------------------
  // No match across all 100 results
  // -------------------------------------------------------------------------

  it('returns rank=null and calls addRankHistory(keywordId, null, url) when not in top 100', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ url: 'https://example.com' }));
    mockCseConfig.getCredentials.mockResolvedValue({ apiKey: 'key-123', cseId: 'cx-abc' });
    mockSeo.addRankHistory.mockResolvedValue({});
    mockPrisma.keyword.update.mockResolvedValue({});

    const misses = makeCseResponse(Array(10).fill('https://nomatch.com/'));
    // 10 pages (start = 1, 11, 21, ..., 91)
    for (let i = 0; i < 10; i++) {
      mockCseList.mockResolvedValueOnce(misses);
    }

    const result = await service.checkKeyword('kw-1');

    expect(result).toEqual({ skipped: false, rank: null });
    expect(mockSeo.addRankHistory).toHaveBeenCalledWith('kw-1', null, 'https://example.com');
    expect(mockCseList).toHaveBeenCalledTimes(10);
  });

  // -------------------------------------------------------------------------
  // Success path: clears error, sets lastCheckedAt, updates currentRank
  // -------------------------------------------------------------------------

  it('on success: clears lastCheckError, sets lastCheckedAt, updates currentRank, clears validationError', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(
      makeKeyword({ url: 'https://example.com', lastCheckError: 'CSE_UNKNOWN_ERROR' }),
    );
    mockCseConfig.getCredentials.mockResolvedValue({ apiKey: 'key', cseId: 'cx' });
    mockSeo.addRankHistory.mockResolvedValue({});
    mockPrisma.keyword.update.mockResolvedValue({});

    // One result that matches
    mockCseList.mockResolvedValueOnce(
      makeCseResponse(['https://example.com/home', ...Array(9).fill('https://other.com/')]),
    );

    await service.checkKeyword('kw-1');

    const updateCall = mockPrisma.keyword.update.mock.calls[0][0];
    expect(updateCall.data.lastCheckError).toBeNull();
    expect(updateCall.data.lastCheckedAt).toBeInstanceOf(Date);
    expect(updateCall.data.currentRank).toBe(1);
    expect(mockCseConfig.clearValidationError).toHaveBeenCalledWith('proj-1');
  });

  // -------------------------------------------------------------------------
  // Google error: quota exceeded
  // -------------------------------------------------------------------------

  it('on CSE_QUOTA_EXCEEDED: sets error on keyword, calls markValidationError, rethrows', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword());
    mockCseConfig.getCredentials.mockResolvedValue({ apiKey: 'key', cseId: 'cx' });
    mockPrisma.keyword.update.mockResolvedValue({});
    mockCseConfig.markValidationError.mockResolvedValue(undefined);

    const quotaErr = Object.assign(new Error('Daily Limit Exceeded'), {
      code: 429,
      errors: [{ reason: 'dailyLimitExceeded' }],
    });
    mockCseList.mockRejectedValueOnce(quotaErr);

    await expect(service.checkKeyword('kw-1')).rejects.toThrow();

    const updateCall = mockPrisma.keyword.update.mock.calls[0][0];
    expect(updateCall.data.lastCheckError).toBe('CSE_QUOTA_EXCEEDED');
    expect(mockCseConfig.markValidationError).toHaveBeenCalledWith('proj-1', 'CSE_QUOTA_EXCEEDED');
  });

  // -------------------------------------------------------------------------
  // Google error: invalid key
  // -------------------------------------------------------------------------

  it('on CSE_INVALID_KEY: sets error on keyword, calls markValidationError, rethrows', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword());
    mockCseConfig.getCredentials.mockResolvedValue({ apiKey: 'bad-key', cseId: 'cx' });
    mockPrisma.keyword.update.mockResolvedValue({});
    mockCseConfig.markValidationError.mockResolvedValue(undefined);

    const keyErr = Object.assign(new Error('API key not valid'), {
      errors: [{ reason: 'keyInvalid' }],
    });
    mockCseList.mockRejectedValueOnce(keyErr);

    await expect(service.checkKeyword('kw-1')).rejects.toThrow();

    const updateCall = mockPrisma.keyword.update.mock.calls[0][0];
    expect(updateCall.data.lastCheckError).toBe('CSE_INVALID_KEY');
    expect(mockCseConfig.markValidationError).toHaveBeenCalledWith('proj-1', 'CSE_INVALID_KEY');
  });

  // -------------------------------------------------------------------------
  // Google error: unknown
  // -------------------------------------------------------------------------

  it('on unknown Google error: sets CSE_UNKNOWN_ERROR, does NOT call markValidationError, rethrows', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword());
    mockCseConfig.getCredentials.mockResolvedValue({ apiKey: 'key', cseId: 'cx' });
    mockPrisma.keyword.update.mockResolvedValue({});

    mockCseList.mockRejectedValueOnce(new Error('Internal Server Error'));

    await expect(service.checkKeyword('kw-1')).rejects.toThrow();

    const updateCall = mockPrisma.keyword.update.mock.calls[0][0];
    expect(updateCall.data.lastCheckError).toBe('CSE_UNKNOWN_ERROR');
    expect(mockCseConfig.markValidationError).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Throttle: manual source
  // -------------------------------------------------------------------------

  describe('throttle — manual source', () => {
    it('4th call within 1 hour throws HttpException 429 with { code: "RATE_LIMITED" }', async () => {
      // Calls 1-3 are allowed; call 4 is blocked before Prisma lookup.
      // Calls 1-3: set up Prisma to return a keyword that is skipped so we
      // don't need to deal with full CSE flow.
      mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ isTracking: false }));

      await service.checkKeyword('kw-throttle', 'manual');
      await service.checkKeyword('kw-throttle', 'manual');
      await service.checkKeyword('kw-throttle', 'manual');

      // 4th call: throttle fires BEFORE Prisma lookup — Prisma should not be called again
      mockPrisma.keyword.findUnique.mockClear();

      await expect(service.checkKeyword('kw-throttle', 'manual')).rejects.toThrow(HttpException);

      let caughtError: HttpException | undefined;
      try {
        await service.checkKeyword('kw-throttle', 'manual');
      } catch (err) {
        caughtError = err as HttpException;
      }

      expect(caughtError).toBeInstanceOf(HttpException);
      expect(caughtError!.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(caughtError!.getResponse()).toEqual({ code: 'RATE_LIMITED' });
      // Prisma was not called during the throttled invocations
      expect(mockPrisma.keyword.findUnique).not.toHaveBeenCalled();
    });

    it('timestamps older than 1 hour are evicted — sliding window allows new calls', async () => {
      jest.useFakeTimers();

      // Call 3 times at t=0
      mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ isTracking: false }));
      await service.checkKeyword('kw-window', 'manual');
      await service.checkKeyword('kw-window', 'manual');
      await service.checkKeyword('kw-window', 'manual');

      // Advance time by just over 1 hour — those 3 timestamps fall outside the window
      jest.setSystemTime(Date.now() + 3_600_001);

      // Call again — should succeed (old timestamps evicted)
      await expect(service.checkKeyword('kw-window', 'manual')).resolves.toEqual({
        skipped: true,
        reason: 'NOT_TRACKING',
      });

      jest.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // Throttle: cron source is unthrottled
  // -------------------------------------------------------------------------

  it('cron source: 10 rapid calls all proceed without throttle', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ isTracking: false }));

    const results = await Promise.all(
      Array.from({ length: 10 }, () => service.checkKeyword('kw-cron', 'cron')),
    );

    // All 10 calls should resolve normally (no 429)
    expect(results).toHaveLength(10);
    results.forEach((r) => expect(r).toEqual({ skipped: true, reason: 'NOT_TRACKING' }));
  });

  // -------------------------------------------------------------------------
  // Throttle: LRU eviction above MAX_TRACKED
  // -------------------------------------------------------------------------

  it('evicts oldest half of entries when map exceeds MAX_TRACKED', async () => {
    // Override MAX_TRACKED to a small value for the test
    (service as any).MAX_TRACKED = 4;

    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ isTracking: false }));

    // Fill the map with 4 distinct keyword IDs (each gets 1 timestamp)
    await service.checkKeyword('kw-evict-a', 'manual');
    await service.checkKeyword('kw-evict-b', 'manual');
    await service.checkKeyword('kw-evict-c', 'manual');
    await service.checkKeyword('kw-evict-d', 'manual');

    // Map now has 4 entries = MAX_TRACKED. One more push triggers eviction.
    await service.checkKeyword('kw-evict-e', 'manual');

    // After eviction, map size should be trimmed (≤ MAX_TRACKED)
    const mapSize = (service as any).recentChecks.size;
    expect(mapSize).toBeLessThanOrEqual(4);
  });
});

// =============================================================================
// localeToGlHl helper
// =============================================================================

describe('localeToGlHl', () => {
  it('converts pl-PL → { gl: "pl", hl: "pl" }', () => {
    expect(localeToGlHl('pl-PL')).toEqual({ gl: 'pl', hl: 'pl' });
  });

  it('converts en-US → { gl: "us", hl: "en" }', () => {
    expect(localeToGlHl('en-US')).toEqual({ gl: 'us', hl: 'en' });
  });

  it('converts ru-RU → { gl: "ru", hl: "ru" }', () => {
    expect(localeToGlHl('ru-RU')).toEqual({ gl: 'ru', hl: 'ru' });
  });

  it('falls back to { gl: "us", hl: "en" } for malformed input', () => {
    expect(localeToGlHl('invalid')).toEqual({ gl: 'us', hl: 'en' });
    expect(localeToGlHl('')).toEqual({ gl: 'us', hl: 'en' });
    expect(localeToGlHl('en')).toEqual({ gl: 'us', hl: 'en' });
  });
});

// =============================================================================
// hostMatches helper
// =============================================================================

describe('hostMatches', () => {
  it('matches the same host', () => {
    expect(hostMatches('https://example.com/foo', 'https://example.com/bar')).toBe(true);
  });

  it('strips www. prefix when comparing', () => {
    expect(hostMatches('https://www.example.com/foo', 'https://example.com')).toBe(true);
    expect(hostMatches('https://example.com', 'http://www.example.com')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(hostMatches('https://Example.COM/foo', 'http://example.com')).toBe(true);
  });

  it('strips port when comparing', () => {
    expect(hostMatches('https://example.com:443/path', 'https://example.com')).toBe(true);
    expect(hostMatches('http://example.com:8080/', 'http://example.com')).toBe(true);
  });

  it('returns false for different hosts', () => {
    expect(hostMatches('https://example.com', 'https://other.com')).toBe(false);
  });

  it('returns false when subdomain differs (api.example.com vs example.com)', () => {
    expect(hostMatches('https://api.example.com/v1', 'https://example.com')).toBe(false);
  });

  it('returns false for malformed/invalid URLs', () => {
    expect(hostMatches('not-a-url', 'https://example.com')).toBe(false);
    expect(hostMatches('https://example.com', 'also-not-a-url')).toBe(false);
  });
});
