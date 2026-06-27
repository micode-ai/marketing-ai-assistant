import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';
import { MetaOAuthService } from './meta-oauth.service';
import { decryptData, encryptData } from '../common/crypto.util';

interface RefreshableAccount {
  id: string;
  organizationId: string;
  platform: string;
  accountName: string | null;
  accountId: string | null;
  encryptedTokens: string;
}

/**
 * Proactively refreshes long-lived Instagram/Threads tokens before they expire
 * (~60 days). Meta's refresh endpoints extend the token by another ~60 days as
 * long as the current token is >24h old and not yet expired — so refreshing
 * within a 10-day window keeps accounts alive indefinitely without re-auth.
 *
 * Mirrors `instagram-sync.service.ts`: daily cron, per-account try/catch, and a
 * REAUTH_REQUIRED flip + CronFailureNotifier.report on failure.
 */
@Injectable()
export class MetaTokenRefreshService {
  private readonly logger = new Logger(MetaTokenRefreshService.name);

  /** Refresh when the token is due to expire within 10 days. */
  static readonly REFRESH_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private notifier: CronFailureNotifier,
    private meta: MetaOAuthService,
  ) {}

  /**
   * Core, testable unit: refresh one account's long-lived token. Decrypts the
   * stored token, calls the platform refresh endpoint, re-encrypts and persists
   * the new token + expiry. On failure, flips the account to REAUTH_REQUIRED and
   * reports a cron failure.
   */
  async refreshAccount(account: RefreshableAccount): Promise<{ refreshed: boolean }> {
    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');

    let tokens: any;
    try {
      tokens = decryptData(account.encryptedTokens, encryptionKey);
    } catch (e) {
      this.logger.warn(
        `Failed to decrypt tokens for ${account.platform} account ${account.id}: ${e}`,
      );
      return { refreshed: false };
    }

    if (!tokens?.accessToken) {
      this.logger.warn(
        `${account.platform} account ${account.id} has no accessToken — skipping`,
      );
      return { refreshed: false };
    }

    try {
      const result =
        account.platform === 'THREADS'
          ? await this.meta.refreshThreadsToken(tokens.accessToken)
          : account.platform === 'INSTAGRAM'
            ? await this.meta.refreshInstagramToken(tokens.accessToken)
            : null;

      if (!result) {
        // Unsupported platform — nothing to do.
        return { refreshed: false };
      }

      tokens.accessToken = result.access_token;
      const encryptedTokens = encryptData(tokens, encryptionKey);
      await this.prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          encryptedTokens,
          expiresAt: new Date(Date.now() + result.expires_in * 1000),
        },
      });

      this.logger.log(
        `Refreshed ${account.platform} token for account ${account.id}`,
      );
      return { refreshed: true };
    } catch (error) {
      await this.handleRefreshError(account, error);
      return { refreshed: false };
    }
  }

  /**
   * Daily at 04:00. Selects ACTIVE Instagram/Threads accounts whose token is
   * known to expire within REFRESH_WINDOW_MS and refreshes each in isolation.
   */
  @Cron('0 4 * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Starting Meta (Instagram/Threads) token refresh');

    const threshold = new Date(
      Date.now() + MetaTokenRefreshService.REFRESH_WINDOW_MS,
    );

    const accounts = await this.prisma.socialAccount.findMany({
      where: {
        platform: { in: ['INSTAGRAM', 'THREADS'] },
        status: 'ACTIVE',
        expiresAt: { not: null, lte: threshold },
      },
    });

    let refreshed = 0;
    for (const account of accounts) {
      try {
        const result = await this.refreshAccount(account as RefreshableAccount);
        if (result.refreshed) refreshed++;
      } catch (error) {
        // refreshAccount already handled its own reporting; swallow so a single
        // failure doesn't abort refreshing the remaining accounts.
        this.logger.error(
          `Token refresh failed for account ${account.id}: ${error}`,
        );
      }
    }

    this.logger.log(
      `Meta token refresh complete: ${refreshed}/${accounts.length} refreshed`,
    );
  }

  private async handleRefreshError(
    account: RefreshableAccount,
    error: unknown,
  ): Promise<void> {
    this.logger.warn(
      `${account.platform} token refresh failed for account ${account.id} — marking REAUTH_REQUIRED`,
    );
    await this.prisma.socialAccount
      .update({
        where: { id: account.id },
        data: { status: 'REAUTH_REQUIRED' },
      })
      .catch(() => {});

    const webUrl = (
      this.config.get<string>('WEB_URL') || 'http://localhost:5173'
    ).replace(/\/$/, '');

    await this.notifier.report({
      organizationId: account.organizationId,
      cronName: 'meta-token-refresh',
      resourceType: 'SocialAccount',
      resourceId: account.id,
      resourceLabel: `${account.platform}: ${account.accountName || account.accountId}`,
      errorCode:
        account.platform === 'THREADS'
          ? 'THREADS_TOKEN_EXPIRED'
          : 'IG_TOKEN_EXPIRED',
      error: error instanceof Error ? error.message : String(error),
      actionUrl: `${webUrl}/settings/integrations`,
    });
  }
}
