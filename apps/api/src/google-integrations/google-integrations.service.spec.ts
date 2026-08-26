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

  describe('getIntegrationView', () => {
    function storeConfig(config: Record<string, unknown> | null) {
      const prisma = (service as any).prisma;
      prisma.projectApiKey.findUnique.mockResolvedValue(
        config
          ? { encryptedKey: Buffer.from(JSON.stringify(config)).toString('base64') }
          : null,
      );
    }

    it('never returns the tokens', async () => {
      // The endpoint used to hand the browser an access AND refresh token so the
      // client could check a boolean.
      storeConfig(MOCK_CONFIG);

      const view = await service.getIntegrationView('proj_1');

      expect(view).toEqual({
        connected: true,
        siteUrl: 'https://example.com/',
        propertyId: null,
        expiresAt: MOCK_CONFIG.expiresAt,
      });
      expect(JSON.stringify(view)).not.toContain('token123');
      expect(JSON.stringify(view)).not.toContain('refresh123');
    });

    it('reports not connected when nothing is stored', async () => {
      storeConfig(null);

      expect(await service.getIntegrationView('proj_1')).toEqual({
        connected: false,
        siteUrl: null,
        propertyId: null,
        expiresAt: null,
      });
    });

    it('reports not connected when the config carries no access token', async () => {
      storeConfig({ siteUrl: 'https://example.com/' });

      const view = await service.getIntegrationView('proj_1');

      expect(view.connected).toBe(false);
      expect(view.siteUrl).toBe('https://example.com/');
    });

    it('still exposes the raw config to server-side callers', async () => {
      // getIntegration keeps the tokens on purpose — the fetchers need them.
      storeConfig(MOCK_CONFIG);

      const raw = await service.getIntegration('proj_1');

      expect(raw.accessToken).toBe('token123');
    });
  });

  describe('saveIntegration', () => {
    function prismaMock() {
      return (service as any).prisma;
    }

    function storedRow(config: Record<string, unknown>, scopes: string[]) {
      return {
        id: 'row_1',
        scopes,
        encryptedKey: Buffer.from(JSON.stringify(config)).toString('base64'),
      };
    }

    function savedPayload(): Record<string, unknown> {
      const call = prismaMock().projectApiKey.update.mock.calls[0][0];
      return JSON.parse(Buffer.from(call.data.encryptedKey, 'base64').toString('utf-8'));
    }

    it('keeps the tokens and the other integration when saving one of them', async () => {
      // Saving a GA4 property used to replace the whole payload, taking the
      // access token, refresh token and siteUrl with it — Search Console would
      // have needed a fresh OAuth round.
      prismaMock().projectApiKey.findUnique.mockResolvedValue(storedRow(MOCK_CONFIG, ['gsc']));

      await service.saveIntegration('proj_1', 'ga4', { propertyId: '123456' });

      const payload = savedPayload();
      expect(payload.accessToken).toBe('token123');
      expect(payload.refreshToken).toBe('refresh123');
      expect(payload.siteUrl).toBe('https://example.com/');
      expect(payload.propertyId).toBe('123456');
    });

    it('unions the scopes instead of collapsing them to the last one', async () => {
      prismaMock().projectApiKey.findUnique.mockResolvedValue(storedRow(MOCK_CONFIG, ['gsc']));

      await service.saveIntegration('proj_1', 'ga4', { propertyId: '123456' });

      const call = prismaMock().projectApiKey.update.mock.calls[0][0];
      expect(call.data.scopes.sort()).toEqual(['ga4', 'gsc']);
    });

    it('does not duplicate a scope that is already recorded', async () => {
      prismaMock().projectApiKey.findUnique.mockResolvedValue(
        storedRow(MOCK_CONFIG, ['gsc', 'ga4']),
      );

      await service.saveIntegration('proj_1', 'gsc', { siteUrl: 'https://other.com/' });

      const call = prismaMock().projectApiKey.update.mock.calls[0][0];
      expect(call.data.scopes.sort()).toEqual(['ga4', 'gsc']);
      expect(savedPayload().siteUrl).toBe('https://other.com/');
    });

    it('creates a fresh row when nothing is stored yet', async () => {
      prismaMock().projectApiKey.findUnique.mockResolvedValue(null);

      await service.saveIntegration('proj_1', 'gsc', { siteUrl: 'https://example.com/' });

      const call = prismaMock().projectApiKey.create.mock.calls[0][0];
      expect(call.data.scopes).toEqual(['gsc']);
    });
  });

  describe('listGa4Properties', () => {
    // This suite's `fetchSpy` spies on fetchSearchConsoleData, not on global
    // fetch, so these tests stub fetch directly.
    let realFetch: typeof global.fetch;
    let httpMock: jest.Mock;

    beforeEach(() => {
      realFetch = global.fetch;
      httpMock = jest.fn();
      global.fetch = httpMock as unknown as typeof global.fetch;
    });

    afterEach(() => {
      global.fetch = realFetch;
    });

    it('flattens accounts into properties with bare numeric ids', async () => {
      // The API returns "properties/123456"; report calls want "123456".
      httpMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          accountSummaries: [
            {
              displayName: 'MiCode',
              propertySummaries: [
                { property: 'properties/123456', displayName: 'mi-code.pl' },
                { property: 'properties/789', displayName: 'app' },
              ],
            },
          ],
        }),
      } as any);

      const properties = await service.listGa4Properties('token123');

      expect(properties).toEqual([
        { propertyId: '123456', displayName: 'mi-code.pl', account: 'MiCode' },
        { propertyId: '789', displayName: 'app', account: 'MiCode' },
      ]);
    });

    it('skips entries with no usable property id', async () => {
      httpMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          accountSummaries: [{ displayName: 'Acc', propertySummaries: [{ displayName: 'broken' }] }],
        }),
      } as any);

      expect(await service.listGa4Properties('token123')).toEqual([]);
    });

    it('returns an empty list rather than throwing when Google refuses', async () => {
      httpMock.mockResolvedValue({ ok: false, text: async () => 'PERMISSION_DENIED' } as any);

      expect(await service.listGa4Properties('token123')).toEqual([]);
    });

    it('falls back to the id when a property has no display name', async () => {
      httpMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          accountSummaries: [{ propertySummaries: [{ property: 'properties/42' }] }],
        }),
      } as any);

      expect(await service.listGa4Properties('token123')).toEqual([
        { propertyId: '42', displayName: '42', account: '' },
      ]);
    });
  });
});
