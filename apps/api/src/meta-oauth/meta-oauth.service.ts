import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GRAPH_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'instagram_manage_comments',
  'pages_show_list',
  'pages_read_engagement',
];

@Injectable()
export class MetaOAuthService {
  private readonly logger = new Logger(MetaOAuthService.name);

  constructor(private config: ConfigService) {}

  getInstagramAuthUrl(redirectUri: string, state: string): string {
    const clientId = this.config.get('FACEBOOK_APP_ID');
    if (!clientId) throw new Error('FACEBOOK_APP_ID not configured');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: INSTAGRAM_SCOPES.join(','),
      state,
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<{ access_token: string; expires_in?: number }> {
    const clientId = this.config.get('FACEBOOK_APP_ID');
    const clientSecret = this.config.get('FACEBOOK_APP_SECRET');
    const params = new URLSearchParams({
      client_id: clientId || '',
      client_secret: clientSecret || '',
      redirect_uri: redirectUri,
      code,
    });
    const res = await fetch(`${GRAPH}/oauth/access_token?${params}`);
    if (!res.ok) throw new Error(`Meta code exchange failed: ${await res.text()}`);
    return res.json() as Promise<{ access_token: string; expires_in?: number }>;
  }

  async getLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; expires_in: number }> {
    const clientId = this.config.get('FACEBOOK_APP_ID');
    const clientSecret = this.config.get('FACEBOOK_APP_SECRET');
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: clientId || '',
      client_secret: clientSecret || '',
      fb_exchange_token: shortLivedToken,
    });
    const res = await fetch(`${GRAPH}/oauth/access_token?${params}`);
    if (!res.ok) throw new Error(`Meta long-lived token exchange failed: ${await res.text()}`);
    return res.json() as Promise<{ access_token: string; expires_in: number }>;
  }

  async discoverInstagramAccount(userAccessToken: string): Promise<{
    igUserId: string; username: string; profilePictureUrl?: string; pageId: string; pageAccessToken: string;
  } | null> {
    const params = new URLSearchParams({
      fields: 'id,name,access_token,instagram_business_account{id,username,profile_picture_url}',
      access_token: userAccessToken,
    });
    const res = await fetch(`${GRAPH}/me/accounts?${params}`);
    if (!res.ok) {
      this.logger.warn(`Meta /me/accounts failed: ${await res.text()}`);
      return null;
    }
    const data = (await res.json()) as {
      data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string; username: string; profile_picture_url?: string } }>;
    };
    const page = (data.data || []).find((p) => p.instagram_business_account?.id);
    if (!page || !page.instagram_business_account) return null;
    return {
      igUserId: page.instagram_business_account.id,
      username: page.instagram_business_account.username,
      profilePictureUrl: page.instagram_business_account.profile_picture_url,
      pageId: page.id,
      pageAccessToken: page.access_token,
    };
  }
}
