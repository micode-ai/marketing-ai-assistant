import { TikTokOAuthService, TIKTOK_SCOPES } from './tiktok-oauth.service';
import { TikTokApiError } from './tiktok-api.util';

describe('TikTokOAuthService', () => {
  const originalFetch = global.fetch;

  function makeService(env: Record<string, string | undefined>) {
    const config = { get: (key: string) => env[key] } as any;
    return new TikTokOAuthService(config);
  }

  const configured = {
    TIKTOK_CLIENT_KEY: 'ck1',
    TIKTOK_CLIENT_SECRET: 'cs1',
  };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('is false until both key and secret are present', () => {
      expect(makeService({}).isConfigured()).toBe(false);
      expect(makeService({ TIKTOK_CLIENT_KEY: 'ck1' }).isConfigured()).toBe(false);
      expect(makeService(configured).isConfigured()).toBe(true);
    });
  });

  describe('getAuthUrl', () => {
    it('builds a v2 authorize URL with the requested scopes and state', () => {
      const url = new URL(
        makeService(configured).getAuthUrl('https://api.example.com/api/tiktok/callback', 'st8'),
      );

      expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
      expect(url.searchParams.get('client_key')).toBe('ck1');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('state')).toBe('st8');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'https://api.example.com/api/tiktok/callback',
      );
      const scope = url.searchParams.get('scope') ?? '';
      expect(scope.split(',')).toEqual(TIKTOK_SCOPES);
      expect(scope).toContain('video.publish');
      expect(scope).toContain('video.list');
    });

    it('disables auto-auth so the consent screen always names the account and scopes', () => {
      const url = new URL(makeService(configured).getAuthUrl('https://x/cb', 's'));

      // Without this TikTok reuses the browser session silently, which would
      // bind the wrong account when a user connects a second one.
      expect(url.searchParams.get('disable_auto_auth')).toBe('1');
    });

    it('throws when credentials are missing', () => {
      expect(() => makeService({}).getAuthUrl('https://x/cb', 's')).toThrow(
        /TIKTOK_CLIENT_KEY/,
      );
    });

    it('honours a TIKTOK_SCOPES override — a sandbox cannot be granted video.publish', () => {
      const svc = makeService({
        ...configured,
        TIKTOK_SCOPES: 'user.info.basic,user.info.profile,user.info.stats,video.list,video.upload',
      });
      const scope = new URL(svc.getAuthUrl('https://x/cb', 's')).searchParams.get('scope') ?? '';

      expect(scope.split(',')).toEqual([
        'user.info.basic',
        'user.info.profile',
        'user.info.stats',
        'video.list',
        'video.upload',
      ]);
      // Asking for a scope the app does not have makes TikTok reject the whole
      // authorize request, so the override must not leak the default extra scope.
      expect(scope).not.toContain('video.publish');
    });

    it('trims whitespace and drops empty entries in the override', () => {
      const svc = makeService({ ...configured, TIKTOK_SCOPES: ' video.list , ,user.info.basic ' });
      expect(svc.requestedScopes()).toEqual(['video.list', 'user.info.basic']);
    });

    it('falls back to the defaults when the override is unset or unusable', () => {
      expect(makeService(configured).requestedScopes()).toEqual(TIKTOK_SCOPES);
      expect(makeService({ ...configured, TIKTOK_SCOPES: '' }).requestedScopes()).toEqual(TIKTOK_SCOPES);
      expect(makeService({ ...configured, TIKTOK_SCOPES: ' , , ' }).requestedScopes()).toEqual(TIKTOK_SCOPES);
    });
  });

  describe('exchangeCode', () => {
    it('posts a form-encoded authorization_code grant and maps the token set', async () => {
      const calls: any[] = [];
      global.fetch = jest.fn(async (url: string, init: any) => {
        calls.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'at1',
            refresh_token: 'rt1',
            open_id: 'oid1',
            scope: 'user.info.basic,video.publish',
            expires_in: 86400,
            refresh_expires_in: 31536000,
          }),
        };
      }) as unknown as typeof fetch;

      const before = Date.now();
      const tokens = await makeService(configured).exchangeCode('code%2F1', 'https://x/cb');

      expect(calls[0].url).toBe('https://open.tiktokapis.com/v2/oauth/token/');
      expect(calls[0].init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      const body = calls[0].init.body as URLSearchParams;
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('client_key')).toBe('ck1');
      expect(body.get('client_secret')).toBe('cs1');
      // TikTok requires the code URL-decoded before the exchange.
      expect(body.get('code')).toBe('code/1');

      expect(tokens.accessToken).toBe('at1');
      expect(tokens.refreshToken).toBe('rt1');
      expect(tokens.openId).toBe('oid1');
      expect(tokens.scopes).toEqual(['user.info.basic', 'video.publish']);
      expect(tokens.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 86_400_000 - 5000);
      expect(tokens.refreshExpiresAt).not.toBeNull();
    });

    it('surfaces the flat error shape the token endpoint uses', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Authorization code is expired',
        }),
      })) as unknown as typeof fetch;

      await expect(
        makeService(configured).exchangeCode('c', 'https://x/cb'),
      ).rejects.toMatchObject({ code: 'invalid_grant' });
    });

    it('throws when the response carries no access token', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
      })) as unknown as typeof fetch;

      await expect(
        makeService(configured).exchangeCode('c', 'https://x/cb'),
      ).rejects.toBeInstanceOf(TikTokApiError);
    });
  });

  describe('refreshToken', () => {
    it('sends a refresh_token grant', async () => {
      const calls: any[] = [];
      global.fetch = jest.fn(async (url: string, init: any) => {
        calls.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'at2',
            refresh_token: 'rt2',
            expires_in: 86400,
          }),
        };
      }) as unknown as typeof fetch;

      const tokens = await makeService(configured).refreshToken('rt1');

      const body = calls[0].init.body as URLSearchParams;
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('rt1');
      // The rotated refresh token must be what callers persist.
      expect(tokens.refreshToken).toBe('rt2');
      expect(tokens.refreshExpiresAt).toBeNull();
    });
  });
});
