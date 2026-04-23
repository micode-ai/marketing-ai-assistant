import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

export interface GSCQueryRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GA4MetricRow {
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
}

@Injectable()
export class GoogleIntegrationsService {
  private readonly logger = new Logger(GoogleIntegrationsService.name);

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
   * Fetch Search Console performance data
   */
  async fetchSearchConsoleData(
    accessToken: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
    dimensions: string[] = ['query'],
    rowLimit = 100,
  ): Promise<GSCQueryRow[]> {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions,
          rowLimit,
        }),
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
    // Store as ProjectApiKey with GOOGLE platform
    const existing = await this.prisma.projectApiKey.findUnique({
      where: { projectId_platform: { projectId, platform: 'GOOGLE' } },
    });

    const encryptedKey = Buffer.from(JSON.stringify({ type, ...config })).toString('base64');

    if (existing) {
      return this.prisma.projectApiKey.update({
        where: { id: existing.id },
        data: { encryptedKey, scopes: [type] },
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
}
