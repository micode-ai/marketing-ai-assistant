import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// "Instagram API with Instagram Login" (Instagram Business Login).
// OAuth via api.instagram.com, Graph calls via graph.instagram.com.
// Uses the Instagram app ID/secret (distinct from the Facebook app credentials).
const IG_OAUTH = 'https://api.instagram.com/oauth';
const IG_GRAPH = 'https://graph.instagram.com';

// Phase 1 needs only basic + content publish. Comments/insights scopes
// (instagram_business_manage_comments / _manage_insights) are added in Phase 2.
const INSTAGRAM_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_insights',
];

// Threads API. OAuth authorize via threads.net, Graph calls via graph.threads.net.
// Uses the Threads app ID/secret (distinct from both the Facebook and Instagram credentials).
const THREADS_OAUTH = 'https://threads.net/oauth';
const THREADS_GRAPH = 'https://graph.threads.net';

const THREADS_SCOPES = ['threads_basic', 'threads_content_publish'];

@Injectable()
export class MetaOAuthService {
  private readonly logger = new Logger(MetaOAuthService.name);

  constructor(private config: ConfigService) {}

  private creds(): { clientId: string; clientSecret: string } {
    const clientId = this.config.get<string>('INSTAGRAM_APP_ID');
    const clientSecret = this.config.get<string>('INSTAGRAM_APP_SECRET');
    if (!clientId) throw new Error('INSTAGRAM_APP_ID not configured');
    if (!clientSecret) throw new Error('INSTAGRAM_APP_SECRET not configured');
    return { clientId, clientSecret };
  }

  getInstagramAuthUrl(redirectUri: string, state: string): string {
    const { clientId } = this.creds();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: INSTAGRAM_SCOPES.join(','),
      state,
    });
    return `${IG_OAUTH}/authorize?${params}`;
  }

  /** Exchange the auth code for a short-lived token. Returns the token + IG user id. */
  async exchangeCode(code: string, redirectUri: string): Promise<{ access_token: string; user_id: string }> {
    const { clientId, clientSecret } = this.creds();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });
    const res = await fetch(`${IG_OAUTH}/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Instagram code exchange failed: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; user_id?: number | string };
    return { access_token: data.access_token, user_id: String(data.user_id ?? '') };
  }

  /** Exchange a short-lived token for a long-lived (60-day) token. */
  async getLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; expires_in: number }> {
    const { clientSecret } = this.creds();
    const params = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: clientSecret,
      access_token: shortLivedToken,
    });
    const res = await fetch(`${IG_GRAPH}/access_token?${params}`);
    if (!res.ok) throw new Error(`Instagram long-lived token exchange failed: ${await res.text()}`);
    return res.json() as Promise<{ access_token: string; expires_in: number }>;
  }

  /** Fetch the connected Instagram account profile. Returns null if the profile is incomplete. */
  async getInstagramUser(
    accessToken: string,
  ): Promise<{ igUserId: string; username: string; profilePictureUrl?: string } | null> {
    const params = new URLSearchParams({
      fields: 'user_id,username,profile_picture_url',
      access_token: accessToken,
    });
    const res = await fetch(`${IG_GRAPH}/me?${params}`);
    if (!res.ok) throw new Error(`Instagram /me failed: ${await res.text()}`);
    const data = (await res.json()) as {
      user_id?: string; id?: string; username?: string; profile_picture_url?: string;
    };
    const igUserId = String(data.user_id ?? data.id ?? '');
    if (!igUserId || !data.username) return null;
    return { igUserId, username: data.username, profilePictureUrl: data.profile_picture_url };
  }

  // ─── Threads ───────────────────────────────────────────────────────────────

  private threadsCreds(): { clientId: string; clientSecret: string } {
    const clientId = this.config.get<string>('THREADS_APP_ID');
    const clientSecret = this.config.get<string>('THREADS_APP_SECRET');
    if (!clientId) throw new Error('THREADS_APP_ID not configured');
    if (!clientSecret) throw new Error('THREADS_APP_SECRET not configured');
    return { clientId, clientSecret };
  }

  getThreadsAuthUrl(redirectUri: string, state: string): string {
    const { clientId } = this.threadsCreds();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: THREADS_SCOPES.join(','),
      state,
    });
    return `${THREADS_OAUTH}/authorize?${params}`;
  }

  /** Exchange the auth code for a short-lived token. Returns the token + Threads user id. */
  async exchangeThreadsCode(code: string, redirectUri: string): Promise<{ access_token: string; user_id: string }> {
    const { clientId, clientSecret } = this.threadsCreds();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });
    const res = await fetch(`${THREADS_GRAPH}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Threads code exchange failed: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; user_id?: number | string };
    return { access_token: data.access_token, user_id: String(data.user_id ?? '') };
  }

  /** Exchange a short-lived token for a long-lived (60-day) token. */
  async getThreadsLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; expires_in: number }> {
    const { clientSecret } = this.threadsCreds();
    const params = new URLSearchParams({
      grant_type: 'th_exchange_token',
      client_secret: clientSecret,
      access_token: shortLivedToken,
    });
    const res = await fetch(`${THREADS_GRAPH}/access_token?${params}`);
    if (!res.ok) throw new Error(`Threads long-lived token exchange failed: ${await res.text()}`);
    return res.json() as Promise<{ access_token: string; expires_in: number }>;
  }

  /** Fetch the connected Threads account profile. Returns null if the profile is incomplete. */
  async getThreadsUser(
    accessToken: string,
  ): Promise<{ threadsUserId: string; username: string; profilePictureUrl?: string } | null> {
    const params = new URLSearchParams({
      fields: 'id,username,threads_profile_picture_url',
      access_token: accessToken,
    });
    const res = await fetch(`${THREADS_GRAPH}/me?${params}`);
    if (!res.ok) throw new Error(`Threads /me failed: ${await res.text()}`);
    const data = (await res.json()) as {
      id?: string; username?: string; threads_profile_picture_url?: string;
    };
    const threadsUserId = String(data.id ?? '');
    if (!threadsUserId || !data.username) return null;
    return { threadsUserId, username: data.username, profilePictureUrl: data.threads_profile_picture_url };
  }
}
