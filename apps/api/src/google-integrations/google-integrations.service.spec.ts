import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleIntegrationsService, GSCSummary } from './google-integrations.service';
import { PrismaService } from '../database/prisma.service';

const MOCK_CONFIG = {
  accessToken: 'token123',
  refreshToken: 'refresh123',
  expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  siteUrl: 'https://example.com/',
};

const MOCK_TOTALS_ROW = { keys: [], clicks: 500, impressions: 10000, ctr: 0.05, position: 8.5 };
const MOCK_DATE_ROW = {
  keys: ['2026-04-01'],
  clicks: 20,
  impressions: 400,
  ctr: 0.05,
  position: 9,
};
const MOCK_QUERY_ROW = {
  keys: ['best marketing tool'],
  clicks: 100,
  impressions: 2000,
  ctr: 0.05,
  position: 5,
};
const MOCK_PAGE_ROW = {
  keys: ['https://example.com/blog/post-1'],
  clicks: 80,
  impressions: 1500,
  ctr: 0.053,
  position: 6,
};
const MOCK_DEVICE_ROW = { keys: ['MOBILE'], clicks: 300, impressions: 6000, ctr: 0.05, position: 8 };
const MOCK_COUNTRY_ROW = { keys: ['pol'], clicks: 200, impressions: 4000, ctr: 0.05, position: 7 };

describe('GoogleIntegrationsService', () => {
  let service: GoogleIntegrationsService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleIntegrationsService,
        {
          provide: PrismaService,
          useValue: {
            projectApiKey: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-value') },
        },
      ],
    }).compile();

    service = module.get<GoogleIntegrationsService>(GoogleIntegrationsService);
    // Clear cache between tests
    (service as any).summaryCache.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchSearchConsoleSummary', () => {
    it('throws GSC_NOT_CONFIGURED when integration is missing', async () => {
      jest.spyOn(service, 'getIntegration').mockResolvedValue(null);

      await expect(service.fetchSearchConsoleSummary('proj-1', 28)).rejects.toMatchObject({
        code: 'GSC_NOT_CONFIGURED',
      });
    });

    it('throws GSC_NOT_CONFIGURED when siteUrl is missing', async () => {
      jest.spyOn(service, 'getIntegration').mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        // no siteUrl
      });

      await expect(service.fetchSearchConsoleSummary('proj-1', 28)).rejects.toMatchObject({
        code: 'GSC_NOT_CONFIGURED',
      });
    });

    it('calls fetchSearchConsoleData 6 times with expected dimensions', async () => {
      jest.spyOn(service, 'getIntegration').mockResolvedValue(MOCK_CONFIG);
      jest.spyOn(service, 'ensureFreshToken').mockResolvedValue('token123');

      fetchSpy = jest
        .spyOn(service, 'fetchSearchConsoleData')
        .mockImplementation(async (_token, _site, _start, _end, dimensions = []) => {
          if (dimensions.length === 0) return [MOCK_TOTALS_ROW];
          if (dimensions[0] === 'date') return [MOCK_DATE_ROW];
          if (dimensions[0] === 'query') return [MOCK_QUERY_ROW];
          if (dimensions[0] === 'page') return [MOCK_PAGE_ROW];
          if (dimensions[0] === 'device') return [MOCK_DEVICE_ROW];
          if (dimensions[0] === 'country') return [MOCK_COUNTRY_ROW];
          return [];
        });

      await service.fetchSearchConsoleSummary('proj-1', 28);

      expect(fetchSpy).toHaveBeenCalledTimes(6);

      // Verify the 6 dimension combinations were used
      const allDims = fetchSpy.mock.calls.map((call: any[]) => call[4]);
      expect(allDims).toContainEqual([]);
      expect(allDims).toContainEqual(['date']);
      expect(allDims).toContainEqual(['query']);
      expect(allDims).toContainEqual(['page']);
      expect(allDims).toContainEqual(['device']);
      expect(allDims).toContainEqual(['country']);
    });

    it('correctly extracts totals from the keys=[] response shape', async () => {
      jest.spyOn(service, 'getIntegration').mockResolvedValue(MOCK_CONFIG);
      jest.spyOn(service, 'ensureFreshToken').mockResolvedValue('token123');
      jest
        .spyOn(service, 'fetchSearchConsoleData')
        .mockImplementation(async (_t, _s, _st, _en, dims = []) => {
          if (dims.length === 0) return [MOCK_TOTALS_ROW];
          return [];
        });

      const result: GSCSummary = await service.fetchSearchConsoleSummary('proj-1', 28);

      expect(result.totals).toEqual({
        clicks: 500,
        impressions: 10000,
        ctr: 0.05,
        position: 8.5,
      });
    });

    it('returns empty totals when GSC returns no rows for the totals dimension', async () => {
      jest.spyOn(service, 'getIntegration').mockResolvedValue(MOCK_CONFIG);
      jest.spyOn(service, 'ensureFreshToken').mockResolvedValue('token123');
      jest.spyOn(service, 'fetchSearchConsoleData').mockResolvedValue([]);

      const result: GSCSummary = await service.fetchSearchConsoleSummary('proj-1', 28);

      expect(result.totals).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
    });

    it('caches results and does not re-fetch within 1 hour', async () => {
      jest.spyOn(service, 'getIntegration').mockResolvedValue(MOCK_CONFIG);
      jest.spyOn(service, 'ensureFreshToken').mockResolvedValue('token123');
      fetchSpy = jest.spyOn(service, 'fetchSearchConsoleData').mockResolvedValue([]);

      // First call — should fetch
      await service.fetchSearchConsoleSummary('proj-cache', 28);
      const firstCallCount = fetchSpy.mock.calls.length;
      expect(firstCallCount).toBeGreaterThan(0);

      // Second call — should hit cache, no new fetches
      await service.fetchSearchConsoleSummary('proj-cache', 28);
      expect(fetchSpy.mock.calls.length).toBe(firstCallCount);
    });

    it('re-fetches after cache TTL has expired', async () => {
      jest.spyOn(service, 'getIntegration').mockResolvedValue(MOCK_CONFIG);
      jest.spyOn(service, 'ensureFreshToken').mockResolvedValue('token123');
      fetchSpy = jest.spyOn(service, 'fetchSearchConsoleData').mockResolvedValue([]);

      // Seed the cache with an old entry
      (service as any).summaryCache.set('proj-ttl:28', {
        data: { totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 }, byDate: [], topQueries: [], topPages: [], byDevice: [], byCountry: [] },
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      });

      await service.fetchSearchConsoleSummary('proj-ttl', 28);

      // Should have triggered new fetches
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
