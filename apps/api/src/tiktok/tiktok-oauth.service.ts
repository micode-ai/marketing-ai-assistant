import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseTikTokEnvelope, TikTokApiError } from './tiktok-api.util';

// TikTok OAuth v2. Authorization happens on www.tiktok.com; the token endpoint
// lives on open.tiktokapis.com and takes form-encoded bodies (not JSON).
// PKCE is required for mobile/desktop clients only — this is a confidential
// server-side client, so client_secret is what authenticates the exchange.
const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

/**
 * Scopes requested at connect time. Publishing needs video.publish (direct post)
 * and video.upload (inbox drafts); analytics needs the user.info.* trio plus
 * video.list. Requesting them together means one authorization covers both.
 */
export const TIKTOK_SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  'video.list',
  'video.publish',
  'video.upload',
];

export interface TikTokTokenSet {
  accessToken: string;
  refreshToken: string;
  openId: string;
  /** Scopes TikTok actually granted — may be narrower than what we requested. */
  scopes: string[];
  /** Access-token expiry (TikTok issues 24h tokens). */
  expiresAt: Date;
  /** Refresh-token expiry (365 days from first issuance). */
  refreshExpiresAt: Date | null;
}

@Injectable()
export class TikTokOAuthService {
  private readonly logger = new Logger(TikTokOAuthService.name);

  constructor(private config: ConfigService) {}

  /** True when the server is configured to talk to TikTok at all. */
  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('TIKTOK_CLIENT_KEY') &&
        this.config.get<string>('TIKTOK_CLIENT_SECRET'),
    );
  }

  private creds(): { clientKey: string; clientSecret: string } {
    const clientKey = this.config.get<string>('TIKTOK_CLIENT_KEY');
    const clientSecret = this.config.get<string>('TIKTOK_CLIENT_SECRET');
    if (!clientKey) throw new Error('TIKTOK_CLIENT_KEY not configured');
    if (!clientSecret) throw new Error('TIKTOK_CLIENT_SECRET not configured');
    return { clientKey, clientSecret };
  }

  getAuthUrl(redirectUri: string, state: string): string {
    const { clientKey } = this.creds();
    const params = new URLSearchParams({
      client_key: clientKey,
      response_type: 'code',
      scope: TIKTOK_SCOPES.join(','),
      redirect_uri: redirectUri,
      state,
    });
    return `${AUTHORIZE_URL}?${params}`;
  }

  /** Exchange an authorization code for the initial token pair. */
  async exchangeCode(code: string, redirectUri: string): Promise<TikTokTokenSet> {
    const { clientKey, clientSecret } = this.creds();
    return this.requestToken(
      {
        client_key: clientKey,
        client_secret: clientSecret,
        code: decodeURIComponent(code),
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      },
      'oauth/token (authorization_code)',
    );
  }

  /**
   * Trade a refresh token for a fresh access token. TikTok may hand back a
   * *different* refresh token, and the old one stops working — so callers must
   * persist whatever comes back rather than keeping the token they sent.
   */
  async refreshToken(refreshToken: string): Promise<TikTokTokenSet> {
    const { clientKey, clientSecret } = this.creds();
    return this.requestToken(
      {
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
      'oauth/token (refresh_token)',
    );
  }

  private async requestToken(
    form: Record<string, string>,
    context: string,
  ): Promise<TikTokTokenSet> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, any>;

    // The token endpoint reports failures as flat `error` / `error_description`
    // fields rather than the `{ error: { code } }` envelope the open API uses.
    if (typeof json.error === 'string' && json.error) {
      throw new TikTokApiError(
        `${context} failed: ${json.error}${json.error_description ? ` — ${json.error_description}` : ''}`,
        json.error,
        json.log_id,
      );
    }
    // Some responses still wrap errors in the standard envelope.
    parseTikTokEnvelope(json, context);

    if (!json.access_token) {
      throw new TikTokApiError(`${context} returned no access_token`, 'invalid_token_response');
    }

    const now = Date.now();
    return {
      accessToken: String(json.access_token),
      refreshToken: String(json.refresh_token ?? ''),
      openId: String(json.open_id ?? ''),
      scopes: typeof json.scope === 'string' && json.scope
        ? json.scope.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
      expiresAt: new Date(now + Number(json.expires_in ?? 86400) * 1000),
      refreshExpiresAt: json.refresh_expires_in
        ? new Date(now + Number(json.refresh_expires_in) * 1000)
        : null,
    };
  }
}
