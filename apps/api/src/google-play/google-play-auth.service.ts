import * as crypto from 'crypto';
import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { encryptData, decryptData } from '../common/crypto.util';

export interface GooglePlayConfig {
  type: 'PLAY_CONSOLE';
  authMethod: 'oauth2' | 'service_account';
  packageName: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  serviceAccountKey?: string;
  lastSyncAt?: string | null;
  initialSyncCompleted?: boolean;
  consecutiveFailures?: number;
}

@Injectable()
export class GooglePlayAuthService {
  private readonly logger = new Logger(GooglePlayAuthService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Generate OAuth2 URL with HMAC-signed state for CSRF protection.
   */
  getAuthUrl(projectId: string): string {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    if (!clientId) throw new InternalServerErrorException('GOOGLE_CLIENT_ID not configured');

    const apiUrl = this.config.get('API_URL', 'http://localhost:3000');
    const redirectUri = `${apiUrl}/api/google-play/auth/callback`;

    const state = this.createState(projectId);

    const scopes = [
      'https://www.googleapis.com/auth/androidpublisher',
      'https://www.googleapis.com/auth/playdeveloperreporting',
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
   * Create HMAC-signed state parameter containing projectId.
   */
  private createState(projectId: string): string {
    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
    const payload = `${projectId}:${Date.now()}`;
    const hmac = crypto
      .createHmac('sha256', encryptionKey)
      .update(payload)
      .digest('hex');
    return Buffer.from(`${payload}:${hmac}`).toString('base64url');
  }

  /**
   * Verify HMAC state and extract projectId.
   */
  verifyState(state: string): string {
    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
    const decoded = Buffer.from(state, 'base64url').toString();
    const parts = decoded.split(':');

    if (parts.length < 3) throw new BadRequestException('Invalid state parameter');

    const hmac = parts.pop()!;
    const payload = parts.join(':');
    const expectedHmac = crypto
      .createHmac('sha256', encryptionKey)
      .update(payload)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      throw new BadRequestException('Invalid state signature');
    }

    // Verify timestamp is not too old (10 minutes)
    const timestamp = parseInt(parts[1], 10);
    if (Date.now() - timestamp > 10 * 60 * 1000) {
      throw new BadRequestException('State parameter expired');
    }

    return parts[0]; // projectId
  }

  /**
   * Exchange authorization code for OAuth2 tokens.
   */
  async exchangeCode(code: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }> {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET');
    const apiUrl = this.config.get('API_URL', 'http://localhost:3000');
    const redirectUri = `${apiUrl}/api/google-play/auth/callback`;

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Token exchange failed: ${error}`);
      throw new BadRequestException('Failed to exchange authorization code');
    }

    return response.json() as Promise<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    }>;
  }

  /**
   * Refresh an expired OAuth2 access token.
   * Throws 'REVOKED' if the refresh token is no longer valid.
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ access_token: string; expires_in: number }> {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if ((error as any)?.error === 'invalid_grant') {
        throw new Error('REVOKED');
      }
      throw new InternalServerErrorException('Failed to refresh access token');
    }

    return response.json() as Promise<{ access_token: string; expires_in: number }>;
  }

  /**
   * Save OAuth2 credentials encrypted in ProjectApiKey.
   */
  async saveOAuthConfig(
    projectId: string,
    tokens: { access_token: string; refresh_token?: string; expires_in: number },
    packageName?: string,
  ): Promise<void> {
    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const existing = await this.getConfig(projectId).catch(() => null);

    const configData: GooglePlayConfig = {
      type: 'PLAY_CONSOLE',
      authMethod: 'oauth2',
      packageName: packageName || existing?.packageName || '',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || existing?.refreshToken,
      expiresAt,
      lastSyncAt: existing?.lastSyncAt || null,
      initialSyncCompleted: existing?.initialSyncCompleted || false,
      consecutiveFailures: 0,
    };

    const encrypted = encryptData(configData, encryptionKey);

    await this.prisma.projectApiKey.upsert({
      where: {
        projectId_platform: {
          projectId,
          platform: 'GOOGLE_PLAY',
        },
      },
      create: {
        projectId,
        platform: 'GOOGLE_PLAY',
        encryptedKey: encrypted,
        scopes: ['androidpublisher', 'playdeveloperreporting'],
      },
      update: {
        encryptedKey: encrypted,
      },
    });
  }

  /**
   * Validate and save service account JSON configuration.
   */
  async saveServiceAccountConfig(
    projectId: string,
    serviceAccountKey: string,
    packageName: string,
  ): Promise<void> {
    // Validate JSON structure
    let keyData: any;
    try {
      keyData = JSON.parse(serviceAccountKey);
    } catch {
      throw new BadRequestException('Invalid service account JSON');
    }

    if (!keyData.client_email || !keyData.private_key) {
      throw new BadRequestException(
        'Service account JSON must contain client_email and private_key',
      );
    }

    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');

    const configData: GooglePlayConfig = {
      type: 'PLAY_CONSOLE',
      authMethod: 'service_account',
      packageName,
      serviceAccountKey,
      lastSyncAt: null,
      initialSyncCompleted: false,
      consecutiveFailures: 0,
    };

    const encrypted = encryptData(configData, encryptionKey);

    await this.prisma.projectApiKey.upsert({
      where: {
        projectId_platform: {
          projectId,
          platform: 'GOOGLE_PLAY',
        },
      },
      create: {
        projectId,
        platform: 'GOOGLE_PLAY',
        encryptedKey: encrypted,
        scopes: ['androidpublisher', 'playdeveloperreporting'],
      },
      update: {
        encryptedKey: encrypted,
      },
    });
  }

  /**
   * Read and decrypt config from ProjectApiKey.
   */
  async getConfig(projectId: string): Promise<GooglePlayConfig> {
    const record = await this.prisma.projectApiKey.findUnique({
      where: {
        projectId_platform: {
          projectId,
          platform: 'GOOGLE_PLAY',
        },
      },
    });

    if (!record) {
      throw new BadRequestException('Google Play not connected for this project');
    }

    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
    return decryptData(record.encryptedKey, encryptionKey) as GooglePlayConfig;
  }

  /**
   * Partially update the stored config.
   */
  async updateConfig(
    projectId: string,
    updates: Partial<GooglePlayConfig>,
  ): Promise<void> {
    const existing = await this.getConfig(projectId);
    const merged = { ...existing, ...updates };
    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
    const encrypted = encryptData(merged, encryptionKey);

    await this.prisma.projectApiKey.update({
      where: {
        projectId_platform: {
          projectId,
          platform: 'GOOGLE_PLAY',
        },
      },
      data: { encryptedKey: encrypted },
    });
  }

  /**
   * Disconnect Google Play integration; optionally delete metrics and reviews.
   */
  async disconnect(projectId: string, deleteData = false): Promise<void> {
    await this.prisma.projectApiKey.deleteMany({
      where: { projectId, platform: 'GOOGLE_PLAY' },
    });

    if (deleteData) {
      await this.prisma.appStoreMetrics.deleteMany({ where: { projectId } });
      await this.prisma.appReview.deleteMany({ where: { projectId } });
    }
  }

  /**
   * Get a valid access token, refreshing if expired.
   * For service accounts, uses googleapis JWT auth.
   */
  async getValidAccessToken(projectId: string): Promise<string> {
    const config = await this.getConfig(projectId);

    if (config.authMethod === 'service_account') {
      const { google } = await import('googleapis');
      const keyData = JSON.parse(config.serviceAccountKey!);
      const auth = new google.auth.JWT({
        email: keyData.client_email,
        key: keyData.private_key,
        scopes: [
          'https://www.googleapis.com/auth/androidpublisher',
          'https://www.googleapis.com/auth/playdeveloperreporting',
        ],
      });
      const { token } = await auth.getAccessToken();
      if (!token) throw new InternalServerErrorException('Failed to get service account token');
      return token;
    }

    // OAuth2 flow
    if (config.accessToken && config.expiresAt) {
      const expiresAt = new Date(config.expiresAt).getTime();
      // Refresh if expires within 5 minutes
      if (Date.now() < expiresAt - 5 * 60 * 1000) {
        return config.accessToken;
      }
    }

    if (!config.refreshToken) {
      throw new BadRequestException('No refresh token available; please reconnect');
    }

    const tokens = await this.refreshAccessToken(config.refreshToken);
    await this.saveOAuthConfig(projectId, {
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
    });

    return tokens.access_token;
  }
}
