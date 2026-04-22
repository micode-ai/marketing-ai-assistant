import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { RankTrackingService, localeToBraveParams, hostMatches } from './rank-tracking.service';
import { PrismaService } from '../database/prisma.service';
import { SeoService } from './seo.service';
import { BraveSearchConfigService } from './brave-search-config.service';

// ---------------------------------------------------------------------------
// Mock axios
// ---------------------------------------------------------------------------

const mockAxiosGet = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => mockAxiosGet(...args),
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

const mockBraveConfig = {
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

/** Builds a Brave Search response with the given result URLs */
function makeBraveResponse(urls: string[]) {
  return {
    data: {
      web: {
        results: urls.map((url) => ({ url, title: 'Test Result' })),
      },
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
        { provide: BraveSearchConfigService, useValue: mockBraveConfig },
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

  it('skips when isTracking is false — no Brave call, no DB write', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ isTracking: false }));

    const result = await service.checkKeyword('kw-1');

    expect(result).toEqual({ skipped: true, reason: 'NOT_TRACKING' });
    expect(mockAxiosGet).not.toHaveBeenCalled();
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
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Skip: Brave credentials not configured
  // -------------------------------------------------------------------------

  it('skips and sets BRAVE_NOT_CONFIGURED when credentials are missing', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword());
    mockBraveConfig.getCredentials.mockResolvedValue(null);
    mockPrisma.keyword.update.mockResolvedValue({});

    const result = await service.checkKeyword('kw-1');

    expect(result).toEqual({ skipped: true, reason: 'BRAVE_NOT_CONFIGURED' });
    expect(mockPrisma.keyword.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'kw-1' },
        data: expect.objectContaining({ lastCheckError: 'BRAVE_NOT_CONFIGURED' }),
      }),
    );
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Successful rank: match on 3rd result (rank 3)
  // -------------------------------------------------------------------------

  it('finds rank 3 when 3rd result matches the target host', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ url: 'https://example.com/page' }));
    mockBraveConfig.getCredentials.mockResolvedValue({ apiKey: 'BSAtest123' });
    mockSeo.addRankHistory.mockResolvedValue({});
    mockPrisma.keyword.update.mockResolvedValue({});

    mockAxiosGet.mockResolvedValueOnce(
      makeBraveResponse([
        'https://other1.com/foo',
        'https://other2.com/bar',
        'https://example.com/different-page',
        'https://other3.com/',
        'https://other4.com/',
      ]),
    );

    const result = await service.checkKeyword('kw-1');

    expect(result).toEqual({ skipped: false, rank: 3 });
    expect(mockSeo.addRankHistory).toHaveBeenCalledWith('kw-1', 3, 'https://example.com/page');
    expect(mockBraveConfig.clearValidationError).toHaveBeenCalledWith('proj-1');
    // Single request to Brave API (top-20 only)
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Successful rank: match at position 1
  // -------------------------------------------------------------------------

  it('finds rank 1 when first result matches the target host', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ url: 'https://example.com' }));
    mockBraveConfig.getCredentials.mockResolvedValue({ apiKey: 'BSAtest123' });
    mockSeo.addRankHistory.mockResolvedValue({});
    mockPrisma.keyword.update.mockResolvedValue({});

    mockAxiosGet.mockResolvedValueOnce(
      makeBraveResponse(['https://example.com/home', 'https://other.com/']),
    );

    const result = await service.checkKeyword('kw-1');

    expect(result).toEqual({ skipped: false, rank: 1 });
  });

  // -------------------------------------------------------------------------
  // No match in top 20 → rank = null
  // -------------------------------------------------------------------------

  it('returns rank=null and calls addRankHistory(keywordId, null, url) when not in top 20', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword({ url: 'https://example.com' }));
    mockBraveConfig.getCredentials.mockResolvedValue({ apiKey: 'BSAtest123' });
    mockSeo.addRankHistory.mockResolvedValue({});
    mockPrisma.keyword.update.mockResolvedValue({});

    mockAxiosGet.mockResolvedValueOnce(
      makeBraveResponse(Array(20).fill('https://nomatch.com/')),
    );

    const result = await service.checkKeyword('kw-1');

    expect(result).toEqual({ skipped: false, rank: null });
    expect(mockSeo.addRankHistory).toHaveBeenCalledWith('kw-1', null, 'https://example.com');
    // Only one request (top-20 in a single call)
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Brave API call params
  // -------------------------------------------------------------------------

  it('calls Brave API with correct headers and params for pl-PL locale', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(
      makeKeyword({ locale: 'pl-PL', url: 'https://example.com', keyword: 'narzędzie seo' }),
    );
    mockBraveConfig.getCredentials.mockResolvedValue({ apiKey: 'BSApolish' });
    mockSeo.addRankHistory.mockResolvedValue({});
    mockPrisma.keyword.update.mockResolvedValue({});
    mockAxiosGet.mockResolvedValueOnce(makeBraveResponse([]));

    await service.checkKeyword('kw-1');

    expect(mockAxiosGet).toHaveBeenCalledWith(
      'https://api.search.brave.com/res/v1/web/search',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Subscription-Token': 'BSApolish',
        }),
        params: expect.objectContaining({
          q: 'narzędzie seo',
          country: 'pl',
          search_lang: 'pl',
          count: 20,
          offset: 0,
        }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Success path: clears error, sets lastCheckedAt, updates currentRank
  // -------------------------------------------------------------------------

  it('on success: clears lastCheckError, sets lastCheckedAt, updates currentRank, clears validationError', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(
      makeKeyword({ url: 'https://example.com', lastCheckError: 'BRAVE_UNKNOWN_ERROR' }),
    );
    mockBraveConfig.getCredentials.mockResolvedValue({ apiKey: 'key' });
    mockSeo.addRankHistory.mockResolvedValue({});
    mockPrisma.keyword.update.mockResolvedValue({});

    // One result that matches
    mockAxiosGet.mockResolvedValueOnce(
      makeBraveResponse(['https://example.com/home', 'https://other.com/']),
    );

    await service.checkKeyword('kw-1');

    const updateCall = mockPrisma.keyword.update.mock.calls[0][0];
    expect(updateCall.data.lastCheckError).toBeNull();
    expect(updateCall.data.lastCheckedAt).toBeInstanceOf(Date);
    expect(updateCall.data.currentRank).toBe(1);
    expect(mockBraveConfig.clearValidationError).toHaveBeenCalledWith('proj-1');
  });

  // -------------------------------------------------------------------------
  // Brave error: quota exceeded (HTTP 429)
  // -------------------------------------------------------------------------

  it('on BRAVE_QUOTA_EXCEEDED (HTTP 429): sets error on keyword, calls markValidationError, rethrows', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword());
    mockBraveConfig.getCredentials.mockResolvedValue({ apiKey: 'key' });
    mockPrisma.keyword.update.mockResolvedValue({});
    mockBraveConfig.markValidationError.mockResolvedValue(undefined);

    const quotaErr = Object.assign(new Error('Too Many Requests'), {
      response: { status: 429 },
    });
    mockAxiosGet.mockRejectedValueOnce(quotaErr);

    await expect(service.checkKeyword('kw-1')).rejects.toThrow();

    const updateCall = mockPrisma.keyword.update.mock.calls[0][0];
    expect(updateCall.data.lastCheckError).toBe('BRAVE_QUOTA_EXCEEDED');
    expect(mockBraveConfig.markValidationError).toHaveBeenCalledWith('proj-1', 'BRAVE_QUOTA_EXCEEDED');
  });

  // -------------------------------------------------------------------------
  // Brave error: invalid key (HTTP 401)
  // -------------------------------------------------------------------------

  it('on BRAVE_INVALID_KEY (HTTP 401): sets error on keyword, calls markValidationError, rethrows', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword());
    mockBraveConfig.getCredentials.mockResolvedValue({ apiKey: 'bad-key' });
    mockPrisma.keyword.update.mockResolvedValue({});
    mockBraveConfig.markValidationError.mockResolvedValue(undefined);

    const keyErr = Object.assign(new Error('Unauthorized'), {
      response: { status: 401 },
    });
    mockAxiosGet.mockRejectedValueOnce(keyErr);

    await expect(service.checkKeyword('kw-1')).rejects.toThrow();

    const updateCall = mockPrisma.keyword.update.mock.calls[0][0];
    expect(updateCall.data.lastCheckError).toBe('BRAVE_INVALID_KEY');
    expect(mockBraveConfig.markValidationError).toHaveBeenCalledWith('proj-1', 'BRAVE_INVALID_KEY');
  });

  // -------------------------------------------------------------------------
  // Brave error: invalid key (HTTP 403)
  // -------------------------------------------------------------------------

  it('on BRAVE_INVALID_KEY (HTTP 403): sets error on keyword, calls markValidationError, rethrows', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword());
    mockBraveConfig.getCredentials.mockResolvedValue({ apiKey: 'bad-key' });
    mockPrisma.keyword.update.mockResolvedValue({});
    mockBraveConfig.markValidationError.mockResolvedValue(undefined);

    const keyErr = Object.assign(new Error('Forbidden'), {
      response: { status: 403 },
    });
    mockAxiosGet.mockRejectedValueOnce(keyErr);

    await expect(service.checkKeyword('kw-1')).rejects.toThrow();

    const updateCall = mockPrisma.keyword.update.mock.calls[0][0];
    expect(updateCall.data.lastCheckError).toBe('BRAVE_INVALID_KEY');
    expect(mockBraveConfig.markValidationError).toHaveBeenCalledWith('proj-1', 'BRAVE_INVALID_KEY');
  });

  // -------------------------------------------------------------------------
  // Brave error: unknown
  // -------------------------------------------------------------------------

  it('on unknown Brave error: sets BRAVE_UNKNOWN_ERROR, does NOT call markValidationError, rethrows', async () => {
    mockPrisma.keyword.findUnique.mockResolvedValue(makeKeyword());
    mockBraveConfig.getCredentials.mockResolvedValue({ apiKey: 'key' });
    mockPrisma.keyword.update.mockResolvedValue({});

    mockAxiosGet.mockRejectedValueOnce(new Error('Internal Server Error'));

    await expect(service.checkKeyword('kw-1')).rejects.toThrow();

    const updateCall = mockPrisma.keyword.update.mock.calls[0][0];
    expect(updateCall.data.lastCheckError).toBe('BRAVE_UNKNOWN_ERROR');
    expect(mockBraveConfig.markValidationError).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Throttle: manual source
  // -------------------------------------------------------------------------

  describe('throttle — manual source', () => {
    it('4th call within 1 hour throws HttpException 429 with { code: "RATE_LIMITED" }', async () => {
      // Calls 1-3 are allowed; call 4 is blocked before Prisma lookup.
      // Calls 1-3: set up Prisma to return a keyword that is skipped so we
      // don't need to deal with full Brave flow.
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
// localeToBraveParams helper
// =============================================================================

describe('localeToBraveParams', () => {
  it('converts pl-PL → { country: "pl", search_lang: "pl" }', () => {
    expect(localeToBraveParams('pl-PL')).toEqual({ country: 'pl', search_lang: 'pl' });
  });

  it('converts en-US → { country: "us", search_lang: "en" }', () => {
    expect(localeToBraveParams('en-US')).toEqual({ country: 'us', search_lang: 'en' });
  });

  it('converts ru-RU → { country: "ru", search_lang: "ru" }', () => {
    expect(localeToBraveParams('ru-RU')).toEqual({ country: 'ru', search_lang: 'ru' });
  });

  it('falls back to { country: "us", search_lang: "en" } for malformed input', () => {
    expect(localeToBraveParams('invalid')).toEqual({ country: 'us', search_lang: 'en' });
    expect(localeToBraveParams('')).toEqual({ country: 'us', search_lang: 'en' });
    expect(localeToBraveParams('en')).toEqual({ country: 'us', search_lang: 'en' });
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
