import { MetaTokenRefreshService } from './meta-token-refresh.service';
import { encryptData, decryptData } from '../common/crypto.util';

// Valid 64-char hex (32-byte) encryption key.
const ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const SIXTY_DAYS_SECONDS = 60 * 24 * 60 * 60;

function makeEncryptedTokens(accessToken = 'old-long-lived-token'): string {
  return encryptData(
    { accessToken, igUserId: '17841400000000000' },
    ENCRYPTION_KEY,
  );
}

function makePrisma() {
  return {
    socialAccount: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    ENCRYPTION_KEY,
    WEB_URL: 'http://localhost:5173',
    ...overrides,
  };
  return {
    get: jest.fn((key: string, def?: string) => values[key] ?? def),
  };
}

function makeNotifier() {
  return { report: jest.fn().mockResolvedValue(undefined) };
}

function makeMeta() {
  return {
    refreshInstagramToken: jest.fn(),
    refreshThreadsToken: jest.fn(),
  };
}

function makeAccount(overrides: Partial<any> = {}) {
  return {
    id: 'acc_1',
    organizationId: 'org_1',
    platform: 'INSTAGRAM',
    accountName: '@brand',
    accountId: '17841400000000000',
    encryptedTokens: makeEncryptedTokens(),
    ...overrides,
  };
}

describe('MetaTokenRefreshService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let config: ReturnType<typeof makeConfig>;
  let notifier: ReturnType<typeof makeNotifier>;
  let meta: ReturnType<typeof makeMeta>;
  let service: MetaTokenRefreshService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    config = makeConfig();
    notifier = makeNotifier();
    meta = makeMeta();
    service = new MetaTokenRefreshService(
      prisma as any,
      config as any,
      notifier as any,
      meta as any,
    );
  });

  describe('refreshAccount', () => {
    it('INSTAGRAM: refreshes, re-encrypts the new token + sets ~60d expiry', async () => {
      meta.refreshInstagramToken.mockResolvedValue({
        access_token: 'new-ig-token',
        expires_in: SIXTY_DAYS_SECONDS,
      });

      const before = Date.now();
      const result = await service.refreshAccount(makeAccount());

      expect(result).toEqual({ refreshed: true });
      expect(meta.refreshInstagramToken).toHaveBeenCalledWith(
        'old-long-lived-token',
      );
      expect(meta.refreshThreadsToken).not.toHaveBeenCalled();

      const arg = prisma.socialAccount.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'acc_1' });

      // The re-encrypted payload must carry the NEW token, not plaintext.
      expect(arg.data.encryptedTokens).not.toContain('new-ig-token');
      const decrypted = decryptData(arg.data.encryptedTokens, ENCRYPTION_KEY);
      expect(decrypted.accessToken).toBe('new-ig-token');
      // igUserId preserved from the merge.
      expect(decrypted.igUserId).toBe('17841400000000000');

      // expiresAt ~60 days out.
      const expiresAt: Date = arg.data.expiresAt;
      const expectedMin = before + SIXTY_DAYS_SECONDS * 1000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin - 5000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + SIXTY_DAYS_SECONDS * 1000 + 5000,
      );

      expect(notifier.report).not.toHaveBeenCalled();
    });

    it('THREADS: calls refreshThreadsToken', async () => {
      meta.refreshThreadsToken.mockResolvedValue({
        access_token: 'new-th-token',
        expires_in: SIXTY_DAYS_SECONDS,
      });

      const result = await service.refreshAccount(
        makeAccount({ platform: 'THREADS' }),
      );

      expect(result).toEqual({ refreshed: true });
      expect(meta.refreshThreadsToken).toHaveBeenCalledWith(
        'old-long-lived-token',
      );
      expect(meta.refreshInstagramToken).not.toHaveBeenCalled();

      const arg = prisma.socialAccount.update.mock.calls[0][0];
      const decrypted = decryptData(arg.data.encryptedTokens, ENCRYPTION_KEY);
      expect(decrypted.accessToken).toBe('new-th-token');
    });

    it('skips (no update) when the token payload has no accessToken', async () => {
      const encryptedTokens = encryptData({ igUserId: 'x' }, ENCRYPTION_KEY);
      const result = await service.refreshAccount(
        makeAccount({ encryptedTokens }),
      );
      expect(result).toEqual({ refreshed: false });
      expect(meta.refreshInstagramToken).not.toHaveBeenCalled();
      expect(prisma.socialAccount.update).not.toHaveBeenCalled();
    });

    it('error path: flips to REAUTH_REQUIRED + reports IG_TOKEN_EXPIRED', async () => {
      meta.refreshInstagramToken.mockRejectedValue(
        new Error('Instagram token refresh failed: expired'),
      );

      const result = await service.refreshAccount(makeAccount());

      expect(result).toEqual({ refreshed: false });
      expect(prisma.socialAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc_1' },
        data: { status: 'REAUTH_REQUIRED' },
      });
      expect(notifier.report).toHaveBeenCalledTimes(1);
      const reported = notifier.report.mock.calls[0][0];
      expect(reported).toMatchObject({
        organizationId: 'org_1',
        cronName: 'meta-token-refresh',
        resourceType: 'SocialAccount',
        resourceId: 'acc_1',
        errorCode: 'IG_TOKEN_EXPIRED',
      });
      expect(reported.actionUrl).toContain('/settings/integrations');
    });

    it('error path for THREADS reports THREADS_TOKEN_EXPIRED', async () => {
      meta.refreshThreadsToken.mockRejectedValue(new Error('boom'));

      await service.refreshAccount(makeAccount({ platform: 'THREADS' }));

      expect(notifier.report.mock.calls[0][0]).toMatchObject({
        errorCode: 'THREADS_TOKEN_EXPIRED',
      });
    });
  });

  describe('handleCron', () => {
    it('selects ACTIVE IG/Threads accounts expiring within the window and refreshes each', async () => {
      meta.refreshInstagramToken.mockResolvedValue({
        access_token: 'new-tok',
        expires_in: SIXTY_DAYS_SECONDS,
      });
      prisma.socialAccount.findMany.mockResolvedValue([
        makeAccount({ id: 'a1' }),
        makeAccount({ id: 'a2', platform: 'THREADS' }),
      ]);
      meta.refreshThreadsToken.mockResolvedValue({
        access_token: 'new-th',
        expires_in: SIXTY_DAYS_SECONDS,
      });

      await service.handleCron();

      const where = prisma.socialAccount.findMany.mock.calls[0][0].where;
      expect(where.platform).toEqual({ in: ['INSTAGRAM', 'THREADS'] });
      expect(where.status).toBe('ACTIVE');
      expect(where.expiresAt.not).toBeNull();
      expect(where.expiresAt.lte).toBeInstanceOf(Date);

      expect(prisma.socialAccount.update).toHaveBeenCalledTimes(2);
    });
  });
});
