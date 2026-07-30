import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { TikTokAccount, TikTokTokenService } from './tiktok-token.service';

/**
 * Safety net for TikTok tokens.
 *
 * Publishing and the analytics sync both refresh on demand, so this cron only
 * matters for accounts nobody touched — it keeps their 24h access token alive
 * and, more usefully, surfaces a dead connection as a REAUTH_REQUIRED banner
 * before the user tries to publish. TikTokTokenService owns the actual refresh,
 * the REAUTH_REQUIRED flip and the notification.
 */
@Injectable()
export class TikTokTokenRefreshService {
  private readonly logger = new Logger(TikTokTokenRefreshService.name);

  constructor(
    private prisma: PrismaService,
    private tokenService: TikTokTokenService,
  ) {}

  /** Daily at 04:30, just after the Meta refresh cron. */
  @Cron('30 4 * * *')
  async handleCron(): Promise<void> {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { platform: 'TIKTOK', status: 'ACTIVE' },
      select: {
        id: true,
        organizationId: true,
        accountName: true,
        accountId: true,
        encryptedTokens: true,
      },
    });

    if (accounts.length === 0) return;
    this.logger.log(`Refreshing ${accounts.length} TikTok token(s)`);

    let refreshed = 0;
    for (const account of accounts) {
      try {
        await this.tokenService.getValidAccessToken(account as TikTokAccount);
        refreshed++;
      } catch (error) {
        // getValidAccessToken already flipped the account and reported the
        // failure; swallow so one dead account doesn't stop the rest.
        this.logger.warn(`TikTok token refresh failed for ${account.id}: ${error}`);
      }
    }

    this.logger.log(`TikTok token refresh complete: ${refreshed}/${accounts.length}`);
  }
}
