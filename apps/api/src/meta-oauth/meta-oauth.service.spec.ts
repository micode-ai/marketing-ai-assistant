import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaOAuthService } from './meta-oauth.service';

describe('MetaOAuthService (Instagram Login)', () => {
  let service: MetaOAuthService;
  const config = {
    get: jest.fn(
      (k: string) =>
        ({ INSTAGRAM_APP_ID: 'ig-app-123', INSTAGRAM_APP_SECRET: 'ig-secret-123' } as Record<string, string>)[k],
    ),
  } as any;

  const originalFetch = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    config.get.mockImplementation(
      (k: string) =>
        ({ INSTAGRAM_APP_ID: 'ig-app-123', INSTAGRAM_APP_SECRET: 'ig-secret-123' } as Record<string, string>)[k],
    );
    const mod: TestingModule = await Test.createTestingModule({
      providers: [MetaOAuthService, { provide: ConfigService, useValue: config }],
    }).compile();
    service = mod.get(MetaOAuthService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('builds an Instagram Login authorization URL with instagram_business scopes and state', () => {
    const url = service.getInstagramAuthUrl('https://api.test/api/meta/callback', 'STATE');
    expect(url).toContain('https://api.instagram.com/oauth/authorize');
    expect(url).toContain('client_id=ig-app-123');
    expect(url).toContain('state=STATE');
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('instagram_business_basic');
    expect(decoded).toContain('instagram_business_content_publish');
    // must NOT use the deprecated Facebook-Login flow
    expect(url).not.toContain('facebook.com');
  });

  it('exchangeCode POSTs to api.instagram.com and returns access_token + user_id (stringified)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'short-tok', user_id: 178414 }),
    }) as any;

    const result = await service.exchangeCode('the-code', 'https://api.test/api/meta/callback');
    expect(result).toEqual({ access_token: 'short-tok', user_id: '178414' });
    const [calledUrl, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(calledUrl).toBe('https://api.instagram.com/oauth/access_token');
    expect(init.method).toBe('POST');
    expect(init.body.toString()).toContain('grant_type=authorization_code');
  });

  it('exchangeCode throws on a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, text: async () => 'bad code' }) as any;
    await expect(service.exchangeCode('c', 'r')).rejects.toThrow(/Instagram code exchange failed/);
  });

  it('exchangeCode throws when INSTAGRAM_APP_ID is missing', async () => {
    config.get.mockImplementation((k: string) => (k === 'INSTAGRAM_APP_SECRET' ? 's' : undefined));
    await expect(service.exchangeCode('c', 'r')).rejects.toThrow(/INSTAGRAM_APP_ID not configured/);
  });

  it('getLongLivedToken GETs graph.instagram.com with ig_exchange_token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'long-tok', expires_in: 5184000 }),
    }) as any;

    const result = await service.getLongLivedToken('short-tok');
    expect(result).toEqual({ access_token: 'long-tok', expires_in: 5184000 });
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://graph.instagram.com/access_token');
    expect(calledUrl).toContain('grant_type=ig_exchange_token');
  });

  it('getLongLivedToken throws on a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, text: async () => 'err' }) as any;
    await expect(service.getLongLivedToken('x')).rejects.toThrow(/Instagram long-lived token exchange failed/);
  });

  it('getInstagramUser returns the profile from graph.instagram.com/me', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user_id: '178414', username: 'brand', profile_picture_url: 'http://x/p.jpg' }),
    }) as any;

    const result = await service.getInstagramUser('long-tok');
    expect(result).toEqual({ igUserId: '178414', username: 'brand', profilePictureUrl: 'http://x/p.jpg' });
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://graph.instagram.com/me');
  });

  it('getInstagramUser returns null when username is missing', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ user_id: '1' }) }) as any;
    expect(await service.getInstagramUser('t')).toBeNull();
  });

  it('getInstagramUser throws on a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, text: async () => 'bad token' }) as any;
    await expect(service.getInstagramUser('t')).rejects.toThrow(/Instagram \/me failed/);
  });
});
