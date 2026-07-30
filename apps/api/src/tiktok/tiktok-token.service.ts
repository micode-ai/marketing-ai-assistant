import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';
import { decryptData, encryptData } from '../common/crypto.util';
import { TikTokOAuthService } from './tiktok-oauth.service';

/** Refresh when the access token has less than this left (TikTok issues 24h tokens). */
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

export interface TikTokAccount {
  id: string;
  organizationId: string;
  accountName?: string | null;
  accountId?: string | null;
  encryptedTokens: string;
}

export interface TikTokTokens {
  accessToken: string;
  refreshToken?: string;
  openId?: string;
  /** ISO string — kept inside the encrypted blob so a refresh needs no extra read. */
  accessExpiresAt?: string;
  refreshExpiresAt?: string;
}

/**
 * Single gate for TikTok access tokens.
 *
 * TikTok access tokens live only 24 hours, so unlike the Meta platforms a cron
 * alone cannot keep them usable — every call site has to be able to refresh on
 * demand. This service owns that: decrypt, refresh when stale, persist the
 * rotated pair, and flip the account to REAUTH_REQUIRED when the refresh token
 * itself is gone.
 */
@Injectable()
export class TikTokTokenService {
  private readonly logger = new Logger(TikTokTokenService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private oauth: TikTokOAuthService,
    private notifier: CronFailureNotifier,
  ) {}

  private encryptionKey(): string {
    return this.config.get<string>('ENCRYPTION_KEY', '');
  }

  /** Decrypt the stored token blob. Throws when it cannot be read. */
  readTokens(account: TikTokAccount): TikTokTokens {
    const tokens = decryptData(account.encryptedTokens, this.encryptionKey()) as TikTokTokens;
    if (!tokens?.accessToken) {
      throw new Error('TikTok account has no stored access token');
    }
    return tokens;
  }

  /**
   * Return a usable access token, refreshing first when the stored one is at or
   * near expiry. On refresh failure the account is marked REAUTH_REQUIRED, a
   * cron-failure notification is reported, and the error propagates so the
   * caller records a failed publish/sync rather than pretending it worked.
   */
  async getValidAccessToken(account: TikTokAccount): Promise<string> {
    const tokens = this.readTokens(account);

    const expiresAt = tokens.accessExpiresAt ? Date.parse(tokens.accessExpiresAt) : NaN;
    const stillFresh = Number.isFinite(expiresAt) && expiresAt - Date.now() > EXPIRY_SKEW_MS;
    if (stillFresh) {
      return tokens.accessToken;
    }

    if (!tokens.refreshToken) {
      await this.markReauthRequired(account, 'No refresh token stored');
      throw new Error('TikTok account requires reauthentication (no refresh token)');
    }

    try {
      const next = await this.oauth.refreshToken(tokens.refreshToken);
      // TikTok may rotate the refresh token; keeping the old one would break the
      // next refresh, so always persist what came back.
      const merged: TikTokTokens = {
        accessToken: next.accessToken,
        refreshToken: next.refreshToken || tokens.refreshToken,
        openId: next.openId || tokens.openId,
        accessExpiresAt: next.expiresAt.toISOString(),
        refreshExpiresAt: (next.refreshExpiresAt ?? null)?.toISOString() ?? tokens.refreshExpiresAt,
      };

      await this.prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          encryptedTokens: encryptData(merged, this.encryptionKey()),
          expiresAt: next.expiresAt,
          status: 'ACTIVE',
        },
      });

      this.logger.log(`Refreshed TikTok access token for account ${account.id}`);
      return merged.accessToken;
    } catch (error) {
      await this.markReauthRequired(
        account,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Flip an account to REAUTH_REQUIRED and notify the org owners/admins. Both
   * steps are best-effort: a bookkeeping failure must not mask the original
   * TikTok error the caller is about to surface.
   */
  async markReauthRequired(account: TikTokAccount, reason: string): Promise<void> {
    this.logger.warn(
      `TikTok account ${account.id} needs reauthentication — ${reason}`,
    );

    await this.prisma.socialAccount
      .update({ where: { id: account.id }, data: { status: 'REAUTH_REQUIRED' } })
      .catch((e) => this.logger.error(`Failed to mark TikTok account ${account.id}: ${e}`));

    const webUrl = (
      this.config.get<string>('WEB_URL') || 'http://localhost:5173'
    ).replace(/\/$/, '');

    await this.notifier
      .report({
        organizationId: account.organizationId,
        cronName: 'tiktok-token-refresh',
        resourceType: 'SocialAccount',
        resourceId: account.id,
        resourceLabel: `TIKTOK: ${account.accountName || account.accountId}`,
        errorCode: 'TIKTOK_TOKEN_EXPIRED',
        error: reason,
        actionUrl: `${webUrl}/settings/integrations`,
      })
      .catch((e) => this.logger.error(`Failed to report TikTok reauth: ${e}`));
  }
}
