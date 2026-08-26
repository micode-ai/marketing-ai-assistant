import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { buildSearchAnalyticsBody, GscFilter, GscQueryOptions } from './gsc-query.util';
import {
  strikingDistance, lowCtr, cannibalization, movers, mergePreviousMetrics,
  InsightRow, LowCtrRow, CannibalRow, MoverRow, MergedRow,
} from './gsc-insights.util';

export interface GSCQueryRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCSummaryMetric {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCSummary {
  totals: GSCSummaryMetric;
  byDate: Array<{ date: string } & GSCSummaryMetric>;
  topQueries: Array<{ query: string } & GSCSummaryMetric>;
  topPages: Array<{ page: string } & GSCSummaryMetric>;
  byDevice: Array<{ device: string; clicks: number; impressions: number }>;
  byCountry: Array<{ country: string; clicks: number; impressions: number }>;
}

export interface GscQueryParams {
  days: number;
  dimensions: string[];
  type?: string;
  filters?: GscFilter[];
  rowLimit?: number;
  startRow?: number;
  compare?: boolean;
}

export interface GscInsightsResult {
  strikingDistance: InsightRow[];
  lowCtr: LowCtrRow[];
  cannibalization: CannibalRow[];
  moversQueries: { gainers: MoverRow[]; losers: MoverRow[] };
  moversPages: { gainers: MoverRow[]; losers: MoverRow[] };
}

export interface GA4MetricRow {
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
}

@Injectable()
export class GoogleIntegrationsService {
  private readonly logger = new Logger(GoogleIntegrationsService.name);

  /** In-memory cache: key → { data, fetchedAt } */
  private readonly summaryCache = new Map<string, { data: GSCSummary; fetchedAt: number }>();
  // Insights cost five Google queries of up to 2000 rows. The SEO page
  // recomputed them on every visit, and the recommendations digest could not
  // afford them at all until they were cached.
  private readonly insightsCache = new Map<string, { data: GscInsightsResult; fetchedAt: number }>();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Get OAuth2 authorization URL for Google (Search Console + Analytics)
   */
  getAuthUrl(redirectUri: string, state: string): string {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');

    const scopes = [
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/analytics.readonly',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string, redirectUri: string) {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId || '',
        client_secret: clientSecret || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Token exchange failed: ${err}`);
    }

    return response.json() as Promise<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
    }>;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId || '',
        client_secret: clientSecret || '',
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) throw new Error('Token refresh failed');

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }

  /**
   * List all sites verified in the user's Search Console.
   * Returns { siteUrl, permissionLevel } for each site.
   */
  async listSearchConsoleSites(
    accessToken: string,
  ): Promise<Array<{ siteUrl: string; permissionLevel: string }>> {
    const response = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const err = await response.text();
      this.logger.warn(`GSC sites.list error: ${err}`);
      return [];
    }
    const data = (await response.json()) as {
      siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>;
    };
    return data.siteEntry || [];
  }

  /**
   * The GA4 properties this token can read.
   *
   * GA4 has no equivalent of Search Console's sites.list: a report needs a
   * numeric property id, and there is nowhere in the product to get one. Without
   * this a user would have to dig the number out of the Analytics admin UI and
   * paste it, which is exactly the kind of step that makes an integration go
   * unused. accountSummaries returns accounts with their properties in one call.
   */
  async listGa4Properties(
    accessToken: string,
  ): Promise<Array<{ propertyId: string; displayName: string; account: string }>> {
    const response = await fetch(
      'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      const err = await response.text();
      this.logger.warn(`GA4 accountSummaries error: ${err}`);
      return [];
    }

    const data = (await response.json()) as {
      accountSummaries?: Array<{
        displayName?: string;
        propertySummaries?: Array<{ property?: string; displayName?: string }>;
      }>;
    };

    const properties: Array<{ propertyId: string; displayName: string; account: string }> = [];
    for (const account of data.accountSummaries ?? []) {
      for (const property of account.propertySummaries ?? []) {
        // "properties/123456" — the API wants the bare number in report calls.
        const propertyId = (property.property ?? '').split('/').pop() ?? '';
        if (!propertyId) continue;
        properties.push({
          propertyId,
          displayName: property.displayName ?? propertyId,
          account: account.displayName ?? '',
        });
      }
    }
    return properties;
  }

  /**
   * Fetch Search Console performance data
   */
  async fetchSearchConsoleData(
    accessToken: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
    dimensions: string[] = ['query'],
    rowLimit = 100,
    options: GscQueryOptions = {},
  ): Promise<GSCQueryRow[]> {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildSearchAnalyticsBody(startDate, endDate, dimensions, rowLimit, options)),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      this.logger.warn(`GSC API error: ${err}`);
      return [];
    }

    const data = (await response.json()) as { rows?: GSCQueryRow[] };
    return data.rows || [];
  }

  /**
   * Fetch GA4 report data
   */
  async fetchGA4Report(
    accessToken: string,
    propertyId: string,
    startDate: string,
    endDate: string,
    dimensions: string[] = ['date'],
    metrics: string[] = ['sessions', 'totalUsers', 'screenPageViews'],
  ): Promise<GA4MetricRow[]> {
    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: dimensions.map((name) => ({ name })),
          metrics: metrics.map((name) => ({ name })),
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      this.logger.warn(`GA4 API error: ${err}`);
      return [];
    }

    const data = (await response.json()) as {
      rows?: Array<{
        dimensionValues: Array<{ value: string }>;
        metricValues: Array<{ value: string }>;
      }>;
    };

    return (data.rows || []).map((row) => ({
      dimensions: Object.fromEntries(
        dimensions.map((d, i) => [d, row.dimensionValues[i]?.value || '']),
      ),
      metrics: Object.fromEntries(
        metrics.map((m, i) => [m, parseFloat(row.metricValues[i]?.value || '0')]),
      ),
    }));
  }

  /**
   * Store Google integration config for a project
   */
  async saveIntegration(
    projectId: string,
    type: 'gsc' | 'ga4',
    config: Record<string, unknown>,
  ) {
    // One row per project holds both integrations, because both ride the same
    // OAuth grant. So this merges rather than replaces: saving a GA4 property
    // used to overwrite the whole payload, taking accessToken, refreshToken and
    // siteUrl with it — configuring Analytics would have disconnected Search
    // Console and required a fresh OAuth round.
    const existing = await this.prisma.projectApiKey.findUnique({
      where: { projectId_platform: { projectId, platform: 'GOOGLE' } },
    });

    const current = existing ? await this.getIntegration(projectId) : null;
    const encryptedKey = Buffer.from(
      JSON.stringify({ ...(current ?? {}), ...config, type }),
    ).toString('base64');

    if (existing) {
      // Union, not replacement: a project can have both gsc and ga4 configured.
      const scopes = Array.from(new Set([...(existing.scopes ?? []), type]));
      return this.prisma.projectApiKey.update({
        where: { id: existing.id },
        data: { encryptedKey, scopes },
      });
    }

    return this.prisma.projectApiKey.create({
      data: {
        projectId,
        platform: 'GOOGLE',
        encryptedKey,
        scopes: [type],
      },
    });
  }

  /**
   * Get stored Google integration config
   */
  async getIntegration(projectId: string) {
    const key = await this.prisma.projectApiKey.findUnique({
      where: { projectId_platform: { projectId, platform: 'GOOGLE' } },
    });

    if (!key) return null;

    try {
      return JSON.parse(Buffer.from(key.encryptedKey, 'base64').toString('utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * What the browser is allowed to know about the integration.
   *
   * `getIntegration` returns the raw payload because server-side callers need
   * the tokens. This endpoint-facing view exists because the client needed only
   * to know whether a connection exists — it used `accessToken` as a truthiness
   * flag — and shipping an access and refresh token to every browser that opens
   * the analytics page bought nothing in exchange.
   */
  async getIntegrationView(projectId: string): Promise<{
    connected: boolean;
    siteUrl: string | null;
    propertyId: string | null;
    expiresAt: string | null;
  }> {
    const config = await this.getIntegration(projectId);

    return {
      connected: Boolean(config?.accessToken),
      siteUrl: (config?.siteUrl as string) ?? null,
      propertyId: (config?.propertyId as string) ?? null,
      expiresAt: (config?.expiresAt as string) ?? null,
    };
  }

  /**
   * Delete Google integration for a project
   */
  async deleteIntegration(projectId: string) {
    const key = await this.prisma.projectApiKey.findUnique({
      where: { projectId_platform: { projectId, platform: 'GOOGLE' } },
    });
    if (key) {
      await this.prisma.projectApiKey.delete({ where: { id: key.id } });
    }
  }

  /**
   * Ensure access token is fresh; rotates in DB if refreshed.
   * Returns the valid access token.
   */
  async ensureFreshToken(projectId: string, config: Record<string, unknown>): Promise<string> {
    let accessToken = config.accessToken as string;
    if (new Date(config.expiresAt as string) < new Date() && config.refreshToken) {
      accessToken = await this.refreshAccessToken(config.refreshToken as string);
      await this.saveIntegration(projectId, 'gsc', {
        ...config,
        accessToken,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      });
    }
    return accessToken;
  }

  /**
   * Fetch a structured GSC summary for the given project + period.
   * Results are cached in memory for 1 hour per (projectId, days) pair.
   */
  async fetchSearchConsoleSummary(projectId: string, days: number): Promise<GSCSummary> {
    const cacheKey = `${projectId}:${days}`;
    const cached = this.summaryCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL_MS) {
      return cached.data;
    }

    const config = await this.getIntegration(projectId);
    if (!config?.accessToken || !config?.siteUrl) {
      throw Object.assign(new Error('GSC_NOT_CONFIGURED'), { code: 'GSC_NOT_CONFIGURED' });
    }

    const accessToken = await this.ensureFreshToken(projectId, config);
    const siteUrl = config.siteUrl as string;

    // endDate = today - 2 (accounts for GSC 2-3 day lag)
    const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const startDate = new Date(
      new Date(endDate).getTime() - (days - 1) * 24 * 60 * 60 * 1000,
    ).toISOString().slice(0, 10);

    const [totalsRows, dateRows, queryRows, pageRows, deviceRows, countryRows] =
      await Promise.all([
        this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, [], 1),
        this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, ['date'], days + 5),
        this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, ['query'], 20),
        this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, ['page'], 20),
        this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, ['device'], 10),
        this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, ['country'], 10),
      ]);

    const totalsRow = totalsRows[0];
    const totals: GSCSummaryMetric = totalsRow
      ? {
          clicks: totalsRow.clicks,
          impressions: totalsRow.impressions,
          ctr: totalsRow.ctr,
          position: totalsRow.position,
        }
      : { clicks: 0, impressions: 0, ctr: 0, position: 0 };

    const byDate = dateRows.map((r) => ({
      date: r.keys[0] ?? '',
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

    const topQueries = queryRows.map((r) => ({
      query: r.keys[0] ?? '',
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

    const topPages = pageRows.map((r) => ({
      page: r.keys[0] ?? '',
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

    const byDevice = deviceRows.map((r) => ({
      device: r.keys[0] ?? '',
      clicks: r.clicks,
      impressions: r.impressions,
    }));

    const byCountry = countryRows.map((r) => ({
      country: r.keys[0] ?? '',
      clicks: r.clicks,
      impressions: r.impressions,
    }));

    const summary: GSCSummary = { totals, byDate, topQueries, topPages, byDevice, byCountry };
    this.summaryCache.set(cacheKey, { data: summary, fetchedAt: Date.now() });
    return summary;
  }

  /**
   * Compute date window for GSC queries (with optional previous period).
   * endDate = today - 2, startDate = endDate - (days - 1).
   * prevEndDate = startDate - 1, prevStartDate = prevEndDate - (days - 1).
   */
  private gscWindow(days: number) {
    const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const startDate = new Date(new Date(endDate).getTime() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const prevEndDate = new Date(new Date(startDate).getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const prevStartDate = new Date(new Date(prevEndDate).getTime() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { startDate, endDate, prevStartDate, prevEndDate };
  }

  /**
   * Fetch GSC data with optional comparison to previous period.
   * When compare=false, prev* fields in result rows are 0/null.
   */
  async fetchSearchConsoleQuery(projectId: string, params: GscQueryParams): Promise<{ rows: MergedRow[] }> {
    const config = await this.getIntegration(projectId);
    if (!config?.accessToken || !config?.siteUrl) {
      throw Object.assign(new Error('GSC_NOT_CONFIGURED'), { code: 'GSC_NOT_CONFIGURED' });
    }
    const accessToken = await this.ensureFreshToken(projectId, config);
    const siteUrl = config.siteUrl as string;
    const { startDate, endDate, prevStartDate, prevEndDate } = this.gscWindow(params.days);
    const opts = { type: params.type, filters: params.filters, startRow: params.startRow };
    const rowLimit = params.rowLimit ?? 100;

    const current = await this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, params.dimensions, rowLimit, opts);
    const previous = params.compare
      ? await this.fetchSearchConsoleData(accessToken, siteUrl, prevStartDate, prevEndDate, params.dimensions, rowLimit, opts)
      : [];
    return { rows: mergePreviousMetrics(current, previous) };
  }

  /**
   * Compute GSC insights: striking distance, low CTR, cannibalization, and movers.
   * Fetches current + previous periods in parallel.
   */
  async computeGscInsights(
    projectId: string,
    params: { days: number; type?: string; filters?: GscFilter[] },
  ): Promise<GscInsightsResult> {
    const cacheKey = `${projectId}:${params.days}:${params.type ?? ''}:${JSON.stringify(params.filters ?? [])}`;
    const cached = this.insightsCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL_MS) {
      return cached.data;
    }

    const config = await this.getIntegration(projectId);
    if (!config?.accessToken || !config?.siteUrl) {
      throw Object.assign(new Error('GSC_NOT_CONFIGURED'), { code: 'GSC_NOT_CONFIGURED' });
    }
    const accessToken = await this.ensureFreshToken(projectId, config);
    const siteUrl = config.siteUrl as string;
    const { startDate, endDate, prevStartDate, prevEndDate } = this.gscWindow(params.days);
    const opts = { type: params.type, filters: params.filters };

    const [curQueries, prevQueries, curPages, prevPages, queryPages] = await Promise.all([
      this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, ['query'], 1000, opts),
      this.fetchSearchConsoleData(accessToken, siteUrl, prevStartDate, prevEndDate, ['query'], 1000, opts),
      this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, ['page'], 1000, opts),
      this.fetchSearchConsoleData(accessToken, siteUrl, prevStartDate, prevEndDate, ['page'], 1000, opts),
      this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, ['query', 'page'], 2000, opts),
    ]);

    const result: GscInsightsResult = {
      strikingDistance: strikingDistance(curQueries),
      lowCtr: lowCtr(curQueries),
      cannibalization: cannibalization(queryPages),
      moversQueries: movers(curQueries, prevQueries),
      moversPages: movers(curPages, prevPages),
    };

    this.insightsCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    return result;
  }

  /**
   * Gather GSC insights and forward to ai-agent /seo-advice endpoint.
   * Returns advice and contextSummary from the AI agent.
   */
  async generateSeoAdvice(
    projectId: string,
    params: { days: number; type?: string; filters?: GscFilter[]; language: string },
  ): Promise<{ advice: string; contextSummary: string }> {
    // Reuses GSC fetching (throws GSC_NOT_CONFIGURED when not connected).
    const insights = await this.computeGscInsights(projectId, { days: params.days, type: params.type, filters: params.filters });
    const totalsRes = await this.fetchSearchConsoleQuery(projectId, {
      days: params.days, dimensions: [], type: params.type, filters: params.filters, rowLimit: 1, compare: true,
    });
    const totals = totalsRes.rows[0] ?? null;

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, websiteUrl: true, industry: true },
    });

    const agentUrl = process.env.AI_AGENT_URL || 'http://localhost:3001';
    const response = await fetch(`${agentUrl}/seo-advice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: project ?? {},
        period: { days: params.days },
        totals,
        insights: {
          strikingDistance: insights.strikingDistance,
          lowCtr: insights.lowCtr,
          cannibalization: insights.cannibalization,
          moversQueries: insights.moversQueries,
        },
        language: params.language,
      }),
    });
    if (!response.ok) {
      throw new Error(`SEO advice agent failed: ${response.status}`);
    }
    return response.json() as Promise<{ advice: string; contextSummary: string }>;
  }
}
