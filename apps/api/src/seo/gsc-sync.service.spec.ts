import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { GscSyncService } from './gsc-sync.service';
import { PrismaService } from '../database/prisma.service';
import { GoogleIntegrationsService } from '../google-integrations/google-integrations.service';
import { SeoService } from './seo.service';

const GSC_CONFIG = {
  type: 'gsc',
  siteUrl: 'https://example.com/',
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
};

const mockPrisma = {
  keyword: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockGoogleIntegrations = {
  getIntegration: jest.fn(),
  refreshAccessToken: jest.fn(),
  saveIntegration: jest.fn(),
  fetchSearchConsoleData: jest.fn(),
};

const mockSeoService = {
  addRankHistoryForDate: jest.fn(),
};

describe('GscSyncService', () => {
  let service: GscSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GscSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GoogleIntegrationsService, useValue: mockGoogleIntegrations },
        { provide: SeoService, useValue: mockSeoService },
      ],
    }).compile();

    service = module.get<GscSyncService>(GscSyncService);
  });

  // ---------------------------------------------------------------------------
  // No GSC config → throws GSC_NOT_CONFIGURED
  // ---------------------------------------------------------------------------

  it('throws GSC_NOT_CONFIGURED when no integration exists', async () => {
    mockGoogleIntegrations.getIntegration.mockResolvedValue(null);

    await expect(service.syncProject('proj-1')).rejects.toThrow(BadRequestException);
    await expect(service.syncProject('proj-1')).rejects.toMatchObject({
      response: { code: 'GSC_NOT_CONFIGURED' },
    });
  });

  it('throws GSC_NOT_CONFIGURED when integration has no siteUrl', async () => {
    mockGoogleIntegrations.getIntegration.mockResolvedValue({ accessToken: 'tok', expiresAt: new Date(Date.now() + 3600000).toISOString() });

    await expect(service.syncProject('proj-1')).rejects.toMatchObject({
      response: { code: 'GSC_NOT_CONFIGURED' },
    });
  });

  // ---------------------------------------------------------------------------
  // Happy path: 3 keywords, 2 match in GSC → 2 rows upserted
  // ---------------------------------------------------------------------------

  it('matches 2 of 3 keywords and upserts rank history', async () => {
    mockGoogleIntegrations.getIntegration.mockResolvedValue(GSC_CONFIG);

    const keywords = [
      { id: 'kw-1', keyword: 'best seo tool', url: 'https://example.com/seo', isTracking: true },
      { id: 'kw-2', keyword: 'marketing software', url: 'https://example.com/marketing', isTracking: true },
      { id: 'kw-3', keyword: 'rare keyword xyz', url: 'https://example.com/rare', isTracking: true },
    ];
    mockPrisma.keyword.findMany.mockResolvedValue(keywords);

    mockGoogleIntegrations.fetchSearchConsoleData.mockResolvedValue([
      { keys: ['best seo tool', 'https://example.com/seo'], clicks: 10, impressions: 100, ctr: 0.1, position: 3.2 },
      { keys: ['marketing software', 'https://example.com/marketing'], clicks: 5, impressions: 50, ctr: 0.1, position: 7.8 },
      { keys: ['other keyword', 'https://other.com/page'], clicks: 2, impressions: 20, ctr: 0.1, position: 5.0 },
    ]);

    mockSeoService.addRankHistoryForDate.mockResolvedValue({});
    mockPrisma.keyword.update.mockResolvedValue({});

    const result = await service.syncProject('proj-1');

    expect(result.synced).toBe(3);
    expect(result.matched).toBe(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toContain('rare keyword xyz');
    expect(mockSeoService.addRankHistoryForDate).toHaveBeenCalledTimes(2);

    // 'best seo tool' → position 3.2 rounds to 3
    expect(mockSeoService.addRankHistoryForDate).toHaveBeenCalledWith(
      'kw-1',
      3,
      'https://example.com/seo',
      expect.any(Date),
    );

    // 'marketing software' → position 7.8 rounds to 8
    expect(mockSeoService.addRankHistoryForDate).toHaveBeenCalledWith(
      'kw-2',
      8,
      'https://example.com/marketing',
      expect.any(Date),
    );
  });

  // ---------------------------------------------------------------------------
  // Query matches but wrong page host → skipped
  // ---------------------------------------------------------------------------

  it('skips keyword when query matches but page host is different', async () => {
    mockGoogleIntegrations.getIntegration.mockResolvedValue(GSC_CONFIG);

    const keywords = [
      { id: 'kw-1', keyword: 'my keyword', url: 'https://example.com/page', isTracking: true },
    ];
    mockPrisma.keyword.findMany.mockResolvedValue(keywords);

    // GSC row: correct query, but different host
    mockGoogleIntegrations.fetchSearchConsoleData.mockResolvedValue([
      { keys: ['my keyword', 'https://otherdomain.com/page'], clicks: 5, impressions: 50, ctr: 0.1, position: 4.0 },
    ]);

    const result = await service.syncProject('proj-1');

    expect(result.matched).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toContain('NO_MATCH_IN_GSC');
    expect(mockSeoService.addRankHistoryForDate).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Fractional GSC position rounds correctly
  // ---------------------------------------------------------------------------

  it('rounds fractional GSC position 3.7 to 4', async () => {
    mockGoogleIntegrations.getIntegration.mockResolvedValue(GSC_CONFIG);

    mockPrisma.keyword.findMany.mockResolvedValue([
      { id: 'kw-1', keyword: 'test keyword', url: 'https://example.com/', isTracking: true },
    ]);

    mockGoogleIntegrations.fetchSearchConsoleData.mockResolvedValue([
      { keys: ['test keyword', 'https://example.com/'], clicks: 1, impressions: 10, ctr: 0.1, position: 3.7 },
    ]);

    mockSeoService.addRankHistoryForDate.mockResolvedValue({});
    mockPrisma.keyword.update.mockResolvedValue({});

    await service.syncProject('proj-1');

    expect(mockSeoService.addRankHistoryForDate).toHaveBeenCalledWith(
      'kw-1',
      4,
      'https://example.com/',
      expect.any(Date),
    );
  });

  // ---------------------------------------------------------------------------
  // Google API error → rethrows with GSC_ERROR
  // ---------------------------------------------------------------------------

  it('rethrows Google API errors with GSC_ERROR code', async () => {
    mockGoogleIntegrations.getIntegration.mockResolvedValue(GSC_CONFIG);

    mockPrisma.keyword.findMany.mockResolvedValue([
      { id: 'kw-1', keyword: 'test', url: 'https://example.com/', isTracking: true },
    ]);

    mockGoogleIntegrations.fetchSearchConsoleData.mockRejectedValue(new Error('Google API quota exceeded'));

    await expect(service.syncProject('proj-1')).rejects.toMatchObject({
      response: { code: 'GSC_ERROR' },
    });
  });

  // ---------------------------------------------------------------------------
  // No keywords → return matched: 0
  // ---------------------------------------------------------------------------

  it('returns matched: 0 when no tracked keywords with url', async () => {
    mockGoogleIntegrations.getIntegration.mockResolvedValue(GSC_CONFIG);
    mockPrisma.keyword.findMany.mockResolvedValue([]);

    const result = await service.syncProject('proj-1');

    expect(result).toEqual({
      synced: 0,
      matched: 0,
      skipped: [],
      details: [],
      siteUrl: GSC_CONFIG.siteUrl,
      date: expect.any(String),
    });
    expect(mockGoogleIntegrations.fetchSearchConsoleData).not.toHaveBeenCalled();
  });
});
