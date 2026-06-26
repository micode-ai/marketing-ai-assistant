import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaOAuthService } from './meta-oauth.service';

describe('MetaOAuthService', () => {
  let service: MetaOAuthService;
  const config = {
    get: jest.fn((k: string) => ({ FACEBOOK_APP_ID: 'app123', FACEBOOK_APP_SECRET: 'secret123' } as Record<string, string>)[k]),
  } as any;

  beforeEach(async () => {
    jest.resetAllMocks();
    // Restore default credential values after each reset
    config.get.mockImplementation(
      (k: string) => ({ FACEBOOK_APP_ID: 'app123', FACEBOOK_APP_SECRET: 'secret123' } as Record<string, string>)[k],
    );
    const mod: TestingModule = await Test.createTestingModule({
      providers: [MetaOAuthService, { provide: ConfigService, useValue: config }],
    }).compile();
    service = mod.get(MetaOAuthService);
  });

  afterEach(() => {
    // Restore global.fetch so mocks do not leak between tests
    (global as any).fetch = undefined;
  });

  // ── getInstagramAuthUrl ──────────────────────────────────────────────────────

  it('builds an authorization URL with IG scopes and state', () => {
    const url = service.getInstagramAuthUrl('https://api.test/api/meta/callback', 'STATE');
    expect(url).toContain('https://www.facebook.com/v21.0/dialog/oauth');
    expect(url).toContain('client_id=app123');
    expect(url).toContain('state=STATE');
    expect(decodeURIComponent(url)).toContain('instagram_content_publish');
    expect(decodeURIComponent(url)).toContain('instagram_basic');
  });

  // ── exchangeCode ─────────────────────────────────────────────────────────────

  it('exchangeCode: happy path returns access_token and expires_in', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'short-tok', expires_in: 3600 }),
    }) as any;

    const result = await service.exchangeCode('auth-code', 'https://api.test/callback');
    expect(result).toEqual({ access_token: 'short-tok', expires_in: 3600 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('client_id=app123');
    expect(calledUrl).toContain('client_secret=secret123');
  });

  it('exchangeCode: non-ok response throws with body text', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: async () => 'invalid_client',
    }) as any;

    await expect(service.exchangeCode('bad-code', 'https://api.test/callback')).rejects.toThrow(
      'invalid_client',
    );
  });

  it('exchangeCode: throws when FACEBOOK_APP_ID is missing', async () => {
    config.get.mockImplementation((k: string) =>
      k === 'FACEBOOK_APP_SECRET' ? 'secret123' : undefined,
    );

    await expect(service.exchangeCode('code', 'https://api.test/callback')).rejects.toThrow(
      /FACEBOOK_APP_ID not configured/,
    );
  });

  // ── getLongLivedToken ────────────────────────────────────────────────────────

  it('getLongLivedToken: happy path returns access_token and expires_in', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'long-tok', expires_in: 5183944 }),
    }) as any;

    const result = await service.getLongLivedToken('short-tok');
    expect(result).toEqual({ access_token: 'long-tok', expires_in: 5183944 });
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('grant_type=fb_exchange_token');
    expect(calledUrl).toContain('client_id=app123');
  });

  it('getLongLivedToken: non-ok response throws with body text', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: async () => 'token_expired',
    }) as any;

    await expect(service.getLongLivedToken('bad-tok')).rejects.toThrow('token_expired');
  });

  // ── discoverInstagramAccount ─────────────────────────────────────────────────

  it('discovers the first page that has a linked Instagram business account', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'pageNoIg', name: 'No IG', access_token: 'pt0' },
          { id: 'page1', name: 'Brand', access_token: 'pt1', instagram_business_account: { id: 'ig1', username: 'brand', profile_picture_url: 'http://x/p.jpg' } },
        ],
      }),
    }) as any;

    const result = await service.discoverInstagramAccount('user-tok');
    expect(result).toEqual({
      igUserId: 'ig1', username: 'brand', profilePictureUrl: 'http://x/p.jpg',
      pageId: 'page1', pageAccessToken: 'pt1',
    });
  });

  it('returns null when no page has an Instagram business account', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, json: async () => ({ data: [{ id: 'p', name: 'x', access_token: 't' }] }),
    }) as any;
    expect(await service.discoverInstagramAccount('user-tok')).toBeNull();
  });

  it('discoverInstagramAccount: non-ok response throws with body text', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: async () => 'invalid_token',
    }) as any;

    await expect(service.discoverInstagramAccount('bad-tok')).rejects.toThrow(
      /Meta \/me\/accounts failed: invalid_token/,
    );
  });
});
