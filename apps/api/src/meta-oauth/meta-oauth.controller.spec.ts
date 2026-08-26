import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
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
            getInstagramAuthUrl: jest.fn().mockReturnValue('https://api.instagram.com/oauth/authorize?test=1'),
            exchangeCode: jest.fn(),
            getLongLivedToken: jest.fn(),
            getInstagramUser: jest.fn(),
            getThreadsAuthUrl: jest.fn().mockReturnValue('https://threads.net/oauth/authorize?test=1'),
            exchangeThreadsCode: jest.fn(),
            getThreadsLongLivedToken: jest.fn(),
            getThreadsUser: jest.fn(),
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
                INSTAGRAM_APP_ID: 'ig-app-123',
                INSTAGRAM_APP_SECRET: 'ig-secret-123',
                THREADS_APP_ID: 'th-app-123',
                THREADS_APP_SECRET: 'th-secret-123',
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

    it('throws ServiceUnavailableException when Instagram app credentials are not configured', () => {
      const cfg = { get: jest.fn((k: string) => (k === 'ENCRYPTION_KEY' ? TEST_ENCRYPTION_KEY : undefined)) };
      const ctrl = new MetaOAuthController(
        { getInstagramAuthUrl: jest.fn() } as any,
        { upsertOAuthAccount: jest.fn() } as any,
        cfg as any,
      );
      expect(() => ctrl.getAuthUrl(mockUser('OWNER'), 'INSTAGRAM')).toThrow(ServiceUnavailableException);
    });

    it('throws BadRequestException when organizationId is passed for an org the user is not a member of', () => {
      const user = { id: 'user-1', memberships: [{ organizationId: 'org-1', role: 'OWNER' }] };
      expect(() => controller.getAuthUrl(user, 'INSTAGRAM', 'org-999')).toThrow(BadRequestException);
    });

    it('throws ForbiddenException when organizationId is passed for an org where the user role is MEMBER', () => {
      const user = {
        id: 'user-1',
        memberships: [
          { organizationId: 'org-1', role: 'OWNER' },
          { organizationId: 'org-2', role: 'MEMBER' },
        ],
      };
      expect(() => controller.getAuthUrl(user, 'INSTAGRAM', 'org-2')).toThrow(ForbiddenException);
    });

    it('returns { url } for THREADS for OWNER', () => {
      const result = controller.getAuthUrl(mockUser('OWNER'), 'THREADS');
      expect(result).toHaveProperty('url');
      expect(metaService.getThreadsAuthUrl).toHaveBeenCalled();
      expect(metaService.getInstagramAuthUrl).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException when Threads app credentials are not configured', () => {
      const cfg = { get: jest.fn((k: string) => (k === 'ENCRYPTION_KEY' ? TEST_ENCRYPTION_KEY : undefined)) };
      const ctrl = new MetaOAuthController(
        { getThreadsAuthUrl: jest.fn() } as any,
        { upsertOAuthAccount: jest.fn() } as any,
        cfg as any,
      );
      expect(() => ctrl.getAuthUrl(mockUser('OWNER'), 'THREADS')).toThrow(ServiceUnavailableException);
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
      const dot = state.lastIndexOf('.');
      // Flip a byte of the decoded signature, not a character of its encoding.
      // Flipping the last character only touched base64url's slack bits, so
      // ~7% of runs produced a different string that decoded to the same 32
      // bytes and verified — a flake `continue-on-error` hid for months.
      const sig = Buffer.from(state.slice(dot + 1), 'base64url');
      sig[0] ^= 0xff;
      const tampered = `${state.slice(0, dot)}.${sig.toString('base64url')}`;

      expect(ctrl.verifyState(tampered)).toBeNull();
    });

    it('returns null for a non-canonical encoding of a valid signature', () => {
      const ctrl = controller as any;
      const state: string = ctrl.signState({ organizationId: 'org-1', platform: 'INSTAGRAM' });
      const dot = state.lastIndexOf('.');
      const sigB64 = state.slice(dot + 1);
      // Set the slack bits of the final character. The bytes are unchanged, so
      // a buffer comparison accepted this; the encoding differs, so a string
      // comparison does not. A signature should be one string, not a family.
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      const lastIdx = alphabet.indexOf(sigB64[sigB64.length - 1]);
      const variant = alphabet[lastIdx | 0b01];
      if (variant === sigB64[sigB64.length - 1]) return; // already non-canonical
      const restated = `${state.slice(0, dot)}.${sigB64.slice(0, -1)}${variant}`;

      expect(ctrl.verifyState(restated)).toBeNull();
    });

    it('accepts its own signature every time', () => {
      const ctrl = controller as any;
      // The flake was in the tampering, so prove the happy path is stable over
      // many distinct digests rather than one lucky payload.
      for (let i = 0; i < 200; i += 1) {
        const state = ctrl.signState({ organizationId: `org-${i}`, platform: 'INSTAGRAM' });
        expect(ctrl.verifyState(state)).toMatchObject({ organizationId: `org-${i}` });
      }
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

      (metaService.exchangeCode as jest.Mock).mockResolvedValue({ access_token: 'short-token', user_id: 'ig-123' });
      (metaService.getLongLivedToken as jest.Mock).mockResolvedValue({
        access_token: 'long-token',
        expires_in: 3600,
      });
      (metaService.getInstagramUser as jest.Mock).mockResolvedValue({
        igUserId: 'ig-123',
        username: 'testuser',
        profilePictureUrl: 'https://example.com/pic.jpg',
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

    it('THREADS happy path: upserts a THREADS account and redirects to threads=connected', async () => {
      const ctrl = controller as any;
      const validState: string = ctrl.signState({ organizationId: 'org-1', platform: 'THREADS' });

      (metaService.exchangeThreadsCode as jest.Mock).mockResolvedValue({
        access_token: 'short-token',
        user_id: 'th-123',
      });
      (metaService.getThreadsLongLivedToken as jest.Mock).mockResolvedValue({
        access_token: 'long-token',
        expires_in: 5184000,
      });
      (metaService.getThreadsUser as jest.Mock).mockResolvedValue({
        threadsUserId: 'th-123',
        username: 'threadsuser',
        profilePictureUrl: 'https://example.com/pic.jpg',
      });

      const res = mockRes();
      await controller.callback('auth-code', validState, res as any);

      expect(socialService.upsertOAuthAccount).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          platform: 'THREADS',
          accountId: 'th-123',
          accountName: 'threadsuser',
          tokens: expect.objectContaining({ accessToken: 'long-token', threadsUserId: 'th-123' }),
        }),
      );
      expect(metaService.getInstagramUser).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('threads=connected'),
      );
    });
  });
});
