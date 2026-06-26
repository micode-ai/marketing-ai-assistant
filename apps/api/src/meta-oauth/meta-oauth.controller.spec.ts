import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaOAuthController } from './meta-oauth.controller';
import { MetaOAuthService } from './meta-oauth.service';
import { SocialService } from '../social/social.service';

const TEST_ENCRYPTION_KEY = 'a'.repeat(64); // valid 64-char hex string for HMAC

const mockUser = (role: string) => ({
  id: 'user-1',
  memberships: [{ organizationId: 'org-1', role }],
});

const mockRes = () => ({ redirect: jest.fn() });

describe('MetaOAuthController', () => {
  let controller: MetaOAuthController;
  let metaService: jest.Mocked<MetaOAuthService>;
  let socialService: jest.Mocked<Pick<SocialService, 'upsertOAuthAccount'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetaOAuthController],
      providers: [
        {
          provide: MetaOAuthService,
          useValue: {
            getInstagramAuthUrl: jest.fn().mockReturnValue('https://fb.com/oauth?test=1'),
            exchangeCode: jest.fn(),
            getLongLivedToken: jest.fn(),
            discoverInstagramAccount: jest.fn(),
          },
        },
        {
          provide: SocialService,
          useValue: {
            upsertOAuthAccount: jest.fn().mockResolvedValue({}),
          },
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

    controller = module.get<MetaOAuthController>(MetaOAuthController);
    metaService = module.get(MetaOAuthService);
    socialService = module.get(SocialService) as any;
  });

  // ─── getAuthUrl ────────────────────────────────────────────────────────────

  describe('getAuthUrl', () => {
    it('throws ForbiddenException for MEMBER role', () => {
      expect(() => controller.getAuthUrl(mockUser('MEMBER'), 'INSTAGRAM')).toThrow(ForbiddenException);
    });

    it('returns { url } for OWNER', () => {
      const result = controller.getAuthUrl(mockUser('OWNER'), 'INSTAGRAM');
      expect(result).toHaveProperty('url');
      expect(metaService.getInstagramAuthUrl).toHaveBeenCalled();
    });

    it('returns { url } for ADMIN', () => {
      const result = controller.getAuthUrl(mockUser('ADMIN'), 'INSTAGRAM');
      expect(result).toHaveProperty('url');
    });

    it('throws BadRequestException when user has no memberships', () => {
      const user = { id: 'u1', memberships: [] };
      expect(() => controller.getAuthUrl(user, 'INSTAGRAM')).toThrow(BadRequestException);
    });

    it('throws BadRequestException for unsupported platform', () => {
      expect(() => controller.getAuthUrl(mockUser('OWNER'), 'FACEBOOK')).toThrow(BadRequestException);
    });
  });

  // ─── state sign / verify ───────────────────────────────────────────────────

  describe('state signing', () => {
    it('signState → verifyState round-trip returns correct payload', () => {
      const ctrl = controller as any;
      const state = ctrl.signState({ organizationId: 'org-1', platform: 'INSTAGRAM' });
      const result = ctrl.verifyState(state);
      expect(result).toEqual(
        expect.objectContaining({ organizationId: 'org-1', platform: 'INSTAGRAM' }),
      );
    });

    it('returns null for a tampered signature', () => {
      const ctrl = controller as any;
      const state: string = ctrl.signState({ organizationId: 'org-1', platform: 'INSTAGRAM' });
      // flip last character of signature
      const tampered = state.slice(0, -1) + (state.endsWith('A') ? 'B' : 'A');
      expect(ctrl.verifyState(tampered)).toBeNull();
    });

    it('returns null for an expired state (ts > 10 min old)', () => {
      const ctrl = controller as any;
      // hand-craft a state with old timestamp using the same key the controller uses
      const body = Buffer.from(
        JSON.stringify({ organizationId: 'org-1', platform: 'INSTAGRAM', ts: Date.now() - 700_000 }),
      ).toString('base64url');
      const sig = Buffer.from(
        crypto.createHmac('sha256', TEST_ENCRYPTION_KEY).update(body).digest(),
      ).toString('base64url');
      expect(ctrl.verifyState(`${body}.${sig}`)).toBeNull();
    });

    it('returns null when state has no dot separator', () => {
      const ctrl = controller as any;
      expect(ctrl.verifyState('nodot')).toBeNull();
    });
  });

  // ─── callback ─────────────────────────────────────────────────────────────

  describe('callback', () => {
    it('redirects to bad_state for a tampered state, no upsert called', async () => {
      const res = mockRes();
      await controller.callback('some-code', 'totally.invalid', res as any);
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('reason=bad_state'),
      );
      expect(socialService.upsertOAuthAccount).not.toHaveBeenCalled();
    });

    it('redirects to bad_state for an expired state, no upsert called', async () => {
      const body = Buffer.from(
        JSON.stringify({ organizationId: 'org-1', platform: 'INSTAGRAM', ts: Date.now() - 700_000 }),
      ).toString('base64url');
      const sig = Buffer.from(
        crypto.createHmac('sha256', TEST_ENCRYPTION_KEY).update(body).digest(),
      ).toString('base64url');
      const expiredState = `${body}.${sig}`;

      const res = mockRes();
      await controller.callback('some-code', expiredState, res as any);
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('reason=bad_state'),
      );
      expect(socialService.upsertOAuthAccount).not.toHaveBeenCalled();
    });

    it('happy path: calls upsertOAuthAccount with verified organizationId and redirects to instagram=connected', async () => {
      const ctrl = controller as any;
      const validState: string = ctrl.signState({ organizationId: 'org-1', platform: 'INSTAGRAM' });

      (metaService.exchangeCode as jest.Mock).mockResolvedValue({ access_token: 'short-token' });
      (metaService.getLongLivedToken as jest.Mock).mockResolvedValue({
        access_token: 'long-token',
        expires_in: 3600,
      });
      (metaService.discoverInstagramAccount as jest.Mock).mockResolvedValue({
        igUserId: 'ig-123',
        username: 'testuser',
        profilePictureUrl: 'https://example.com/pic.jpg',
        pageId: 'page-123',
        pageAccessToken: 'page-token',
      });

      const res = mockRes();
      await controller.callback('auth-code', validState, res as any);

      expect(socialService.upsertOAuthAccount).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ platform: 'INSTAGRAM', accountId: 'ig-123' }),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('instagram=connected'),
      );
    });
  });
});
