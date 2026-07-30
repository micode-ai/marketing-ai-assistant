import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TikTokOAuthController } from './tiktok-oauth.controller';
import { TikTokOAuthService } from './tiktok-oauth.service';
import { TikTokPublishService } from './tiktok-publish.service';
import { SocialService } from '../social/social.service';
import * as apiUtil from './tiktok-api.util';

const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

const mockUser = (role: string) => ({
  id: 'user-1',
  memberships: [{ organizationId: 'org-1', role }],
});

const mockRes = () => ({ redirect: jest.fn() });

describe('TikTokOAuthController', () => {
  let controller: TikTokOAuthController;
  let tiktok: jest.Mocked<TikTokOAuthService>;
  let socialService: jest.Mocked<Pick<SocialService, 'upsertOAuthAccount'>>;
  let userSpy: jest.SpyInstance;

  const tokenSet = {
    accessToken: 'at1',
    refreshToken: 'rt1',
    openId: 'oid1',
    scopes: ['user.info.basic', 'video.publish'],
    expiresAt: new Date('2026-07-31T00:00:00Z'),
    refreshExpiresAt: new Date('2027-07-30T00:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TikTokOAuthController],
      providers: [
        {
          provide: TikTokOAuthService,
          useValue: {
            isConfigured: jest.fn().mockReturnValue(true),
            getAuthUrl: jest.fn().mockReturnValue('https://www.tiktok.com/v2/auth/authorize/?test=1'),
            exchangeCode: jest.fn().mockResolvedValue(tokenSet),
          },
        },
        {
          provide: TikTokPublishService,
          useValue: { directPostEnabled: jest.fn().mockReturnValue(false) },
        },
        {
          provide: SocialService,
          useValue: { upsertOAuthAccount: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, string> = {
                API_URL: 'http://localhost:3000',
                WEB_URL: 'http://localhost:5173',
                ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
              };
              return map[key];
            }),
          },
        },
      ],
    }).compile();

    controller = module.get(TikTokOAuthController);
    tiktok = module.get(TikTokOAuthService);
    socialService = module.get(SocialService) as any;

    userSpy = jest.spyOn(apiUtil, 'fetchTikTokUser').mockResolvedValue({
      openId: 'oid1',
      username: 'brand',
      displayName: 'Brand',
      avatarUrl: 'https://cdn/a.jpg',
    });
  });

  afterEach(() => jest.restoreAllMocks());

  /**
   * Obtain a state the controller will accept by going through the public
   * auth-url path, so the test never re-implements the signing it verifies.
   */
  function signedState(): string {
    controller.getAuthUrl(mockUser('OWNER'));
    return tiktok.getAuthUrl.mock.calls.at(-1)![1];
  }

  describe('capabilities', () => {
    it('reports configuration and publish mode so the UI can warn about drafts', () => {
      expect(controller.capabilities()).toEqual({ configured: true, directPost: false });
    });
  });

  describe('getAuthUrl', () => {
    it('returns { url } for OWNER and ADMIN', () => {
      expect(controller.getAuthUrl(mockUser('OWNER'))).toHaveProperty('url');
      expect(controller.getAuthUrl(mockUser('ADMIN'))).toHaveProperty('url');
      expect(tiktok.getAuthUrl).toHaveBeenCalledWith(
        'http://localhost:3000/api/tiktok/callback',
        expect.any(String),
      );
    });

    it('throws ForbiddenException for MEMBER role', () => {
      expect(() => controller.getAuthUrl(mockUser('MEMBER'))).toThrow(ForbiddenException);
    });

    it('throws BadRequestException without memberships', () => {
      expect(() => controller.getAuthUrl({ id: 'u1', memberships: [] })).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for an organization the user does not belong to', () => {
      expect(() => controller.getAuthUrl(mockUser('OWNER'), 'org-999')).toThrow(
        BadRequestException,
      );
    });

    it('throws ServiceUnavailableException when TikTok credentials are missing', () => {
      tiktok.isConfigured.mockReturnValue(false);
      expect(() => controller.getAuthUrl(mockUser('OWNER'))).toThrow(ServiceUnavailableException);
    });
  });

  describe('callback', () => {
    it('connects the account and redirects on success', async () => {
      const state = signedState();
      const res = mockRes();

      await controller.callback('code-1', state, '', res as any);

      expect(tiktok.exchangeCode).toHaveBeenCalledWith(
        'code-1',
        'http://localhost:3000/api/tiktok/callback',
      );
      expect(socialService.upsertOAuthAccount).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          platform: 'TIKTOK',
          accountId: 'oid1',
          accountName: 'brand',
          // Granted scopes, not the requested list.
          scopes: ['user.info.basic', 'video.publish'],
        }),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/settings/integrations?tiktok=connected',
      );
    });

    it('still connects when the profile lookup fails, using the token open_id', async () => {
      userSpy.mockRejectedValue(new Error('flaky'));
      const state = signedState();
      const res = mockRes();

      await controller.callback('code-1', state, '', res as any);

      expect(socialService.upsertOAuthAccount).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ accountId: 'oid1', accountName: 'tiktok_oid1' }),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/settings/integrations?tiktok=connected',
      );
    });

    it('rejects a forged state', async () => {
      const res = mockRes();
      await controller.callback('code-1', 'not.a.valid.state', '', res as any);

      expect(socialService.upsertOAuthAccount).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/settings/integrations?tiktok=error&reason=bad_state',
      );
    });

    it('reports a declined consent screen', async () => {
      const res = mockRes();
      await controller.callback('', '', 'access_denied', res as any);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/settings/integrations?tiktok=error&reason=access_denied',
      );
    });

    it('redirects with no_code when TikTok returns a state but no code', async () => {
      const state = signedState();
      const res = mockRes();

      await controller.callback('', state, '', res as any);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/settings/integrations?tiktok=error&reason=no_code',
      );
    });

    it('redirects with exchange_failed when the token exchange throws', async () => {
      tiktok.exchangeCode.mockRejectedValue(new Error('invalid_grant'));
      const state = signedState();
      const res = mockRes();

      await controller.callback('code-1', state, '', res as any);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/settings/integrations?tiktok=error&reason=exchange_failed',
      );
    });
  });
});
