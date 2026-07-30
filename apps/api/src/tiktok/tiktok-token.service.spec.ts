import { TikTokTokenService, TikTokTokens } from './tiktok-token.service';
import { encryptData, decryptData } from '../common/crypto.util';

const KEY = 'a'.repeat(64);

describe('TikTokTokenService', () => {
  const config = { get: (key: string, fallback?: string) => (key === 'ENCRYPTION_KEY' ? KEY : fallback ?? 'https://app.example.com') } as any;

  let prisma: any;
  let oauth: any;
  let notifier: any;
  let service: TikTokTokenService;

  function account(tokens: TikTokTokens) {
    return {
      id: 'acc1',
      organizationId: 'org1',
      accountName: 'brand',
      accountId: 'oid1',
      encryptedTokens: encryptData(tokens, KEY),
    };
  }

  beforeEach(() => {
    prisma = { socialAccount: { update: jest.fn().mockResolvedValue({}) } };
    oauth = { refreshToken: jest.fn() };
    notifier = { report: jest.fn().mockResolvedValue(undefined) };
    service = new TikTokTokenService(prisma, config, oauth, notifier);
  });

  it('returns the stored token untouched while it is still fresh', async () => {
    const acc = account({
      accessToken: 'at1',
      refreshToken: 'rt1',
      accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    await expect(service.getValidAccessToken(acc)).resolves.toBe('at1');
    expect(oauth.refreshToken).not.toHaveBeenCalled();
    expect(prisma.socialAccount.update).not.toHaveBeenCalled();
  });

  it('refreshes an expired token and persists the rotated refresh token', async () => {
    const newExpiry = new Date(Date.now() + 86_400_000);
    oauth.refreshToken.mockResolvedValue({
      accessToken: 'at2',
      refreshToken: 'rt2',
      openId: 'oid1',
      scopes: [],
      expiresAt: newExpiry,
      refreshExpiresAt: null,
    });

    const acc = account({
      accessToken: 'at1',
      refreshToken: 'rt1',
      accessExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(service.getValidAccessToken(acc)).resolves.toBe('at2');
    expect(oauth.refreshToken).toHaveBeenCalledWith('rt1');

    const data = prisma.socialAccount.update.mock.calls[0][0].data;
    expect(data.expiresAt).toEqual(newExpiry);
    expect(data.status).toBe('ACTIVE');
    // The rotated refresh token replaces the old one — reusing rt1 would fail next time.
    expect(decryptData(data.encryptedTokens, KEY)).toMatchObject({
      accessToken: 'at2',
      refreshToken: 'rt2',
    });
  });

  it('refreshes a token whose expiry is inside the skew window', async () => {
    oauth.refreshToken.mockResolvedValue({
      accessToken: 'at2',
      refreshToken: 'rt1',
      openId: 'oid1',
      scopes: [],
      expiresAt: new Date(Date.now() + 86_400_000),
      refreshExpiresAt: null,
    });

    const acc = account({
      accessToken: 'at1',
      refreshToken: 'rt1',
      // 2 minutes left — inside the 5-minute skew, so it must not be trusted.
      accessExpiresAt: new Date(Date.now() + 120_000).toISOString(),
    });

    await expect(service.getValidAccessToken(acc)).resolves.toBe('at2');
    expect(oauth.refreshToken).toHaveBeenCalled();
  });

  it('refreshes when no expiry was recorded rather than gambling on the token', async () => {
    oauth.refreshToken.mockResolvedValue({
      accessToken: 'at2',
      refreshToken: 'rt1',
      openId: 'oid1',
      scopes: [],
      expiresAt: new Date(Date.now() + 86_400_000),
      refreshExpiresAt: null,
    });

    await expect(
      service.getValidAccessToken(account({ accessToken: 'at1', refreshToken: 'rt1' })),
    ).resolves.toBe('at2');
    expect(oauth.refreshToken).toHaveBeenCalled();
  });

  it('marks REAUTH_REQUIRED and reports when there is no refresh token', async () => {
    const acc = account({
      accessToken: 'at1',
      accessExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(service.getValidAccessToken(acc)).rejects.toThrow(/reauthentication/i);
    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc1' },
      data: { status: 'REAUTH_REQUIRED' },
    });
    expect(notifier.report).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org1',
        cronName: 'tiktok-token-refresh',
        errorCode: 'TIKTOK_TOKEN_EXPIRED',
        resourceId: 'acc1',
      }),
    );
  });

  it('marks REAUTH_REQUIRED, reports, and rethrows when the refresh call fails', async () => {
    oauth.refreshToken.mockRejectedValue(new Error('invalid_grant'));

    const acc = account({
      accessToken: 'at1',
      refreshToken: 'rt1',
      accessExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(service.getValidAccessToken(acc)).rejects.toThrow('invalid_grant');
    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc1' },
      data: { status: 'REAUTH_REQUIRED' },
    });
    expect(notifier.report).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'TIKTOK_TOKEN_EXPIRED' }),
    );
  });

  it('still surfaces the original error when bookkeeping fails', async () => {
    prisma.socialAccount.update.mockRejectedValue(new Error('db down'));
    notifier.report.mockRejectedValue(new Error('smtp down'));
    oauth.refreshToken.mockRejectedValue(new Error('invalid_grant'));

    const acc = account({
      accessToken: 'at1',
      refreshToken: 'rt1',
      accessExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(service.getValidAccessToken(acc)).rejects.toThrow('invalid_grant');
  });

  it('rejects a token blob without an access token', () => {
    expect(() => service.readTokens(account({} as TikTokTokens))).toThrow(
      /no stored access token/i,
    );
  });
});
