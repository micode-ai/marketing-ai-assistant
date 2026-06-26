import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaOAuthService } from './meta-oauth.service';

describe('MetaOAuthService', () => {
  let service: MetaOAuthService;
  const config = {
    get: jest.fn((k: string) => ({ FACEBOOK_APP_ID: 'app123', FACEBOOK_APP_SECRET: 'secret123' } as Record<string, string>)[k]),
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [MetaOAuthService, { provide: ConfigService, useValue: config }],
    }).compile();
    service = mod.get(MetaOAuthService);
  });

  it('builds an authorization URL with IG scopes and state', () => {
    const url = service.getInstagramAuthUrl('https://api.test/api/meta/callback', 'STATE');
    expect(url).toContain('https://www.facebook.com/v21.0/dialog/oauth');
    expect(url).toContain('client_id=app123');
    expect(url).toContain('state=STATE');
    expect(decodeURIComponent(url)).toContain('instagram_content_publish');
    expect(decodeURIComponent(url)).toContain('instagram_basic');
  });

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
});
