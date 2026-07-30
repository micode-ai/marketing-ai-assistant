import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as crypto from 'crypto';
import { SocialService } from '../social/social.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TikTokOAuthService } from './tiktok-oauth.service';
import { fetchTikTokUser } from './tiktok-api.util';
import { TikTokPublishService } from './tiktok-publish.service';

const STATE_TTL_MS = 600_000; // 10 minutes

/**
 * TikTok OAuth. Same shape as MetaOAuthController: a signed, short-lived state
 * carries the organization id through the redirect, and the callback is @Public()
 * because TikTok's redirect arrives without our bearer token.
 */
@ApiTags('tiktok')
@ApiBearerAuth()
@Controller('tiktok')
export class TikTokOAuthController {
  constructor(
    private tiktok: TikTokOAuthService,
    private socialService: SocialService,
    private publishService: TikTokPublishService,
    private config: ConfigService,
  ) {}

  private redirectUri(): string {
    const apiUrl = this.config.get('API_URL') || 'http://localhost:3000';
    return `${apiUrl}/api/tiktok/callback`;
  }

  private signState(payload: object): string {
    const secret = this.config.get('ENCRYPTION_KEY') || '';
    const body = Buffer.from(JSON.stringify({ ...payload, ts: Date.now() })).toString('base64url');
    const sig = Buffer.from(
      crypto.createHmac('sha256', secret).update(body).digest(),
    ).toString('base64url');
    return `${body}.${sig}`;
  }

  private verifyState(state: string): { organizationId: string } | null {
    try {
      const dotIdx = state.lastIndexOf('.');
      if (dotIdx === -1) return null;
      const body = state.slice(0, dotIdx);
      const sigB64 = state.slice(dotIdx + 1);
      const secret = this.config.get('ENCRYPTION_KEY') || '';
      const expectedB64 = Buffer.from(
        crypto.createHmac('sha256', secret).update(body).digest(),
      ).toString('base64url');
      const sigBuf = Buffer.from(sigB64, 'base64url');
      const expectedBuf = Buffer.from(expectedB64, 'base64url');
      if (sigBuf.length !== expectedBuf.length) return null;
      if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
      const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
      if (!parsed.ts || Date.now() - parsed.ts > STATE_TTL_MS) return null;
      return { organizationId: parsed.organizationId };
    } catch {
      return null;
    }
  }

  /**
   * Publishing capabilities of this deployment. The web app uses `directPost` to
   * tell the user whether a TikTok publish goes live or lands in their drafts.
   */
  @Get('capabilities')
  capabilities() {
    return {
      configured: this.tiktok.isConfigured(),
      directPost: this.publishService.directPostEnabled(),
    };
  }

  @Get('auth-url')
  getAuthUrl(@CurrentUser() user: any, @Query('organizationId') organizationId?: string) {
    const memberships = user.memberships || [];
    const membership = organizationId
      ? memberships.find((m: any) => m.organizationId === organizationId)
      : memberships[0];
    if (!membership) throw new BadRequestException('No organization');
    if (!['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new ForbiddenException('Only OWNER or ADMIN can connect social accounts');
    }

    if (!this.tiktok.isConfigured()) {
      throw new ServiceUnavailableException(
        'TikTok integration is not configured on this server yet. An administrator must set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.',
      );
    }

    const state = this.signState({ organizationId: membership.organizationId });
    return { url: this.tiktok.getAuthUrl(this.redirectUri(), state) };
  }

  @Get('callback')
  @Public()
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const webUrl = (this.config.get('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
    const fail = (reason: string) =>
      res.redirect(`${webUrl}/settings/integrations?tiktok=error&reason=${reason}`);

    // TikTok reports a declined consent screen as ?error=access_denied.
    if (error) return fail(error);

    const parsed = this.verifyState(state);
    if (!parsed) return fail('bad_state');
    if (!code) return fail('no_code');

    try {
      const tokens = await this.tiktok.exchangeCode(code, this.redirectUri());

      // The profile call is only for the display name/avatar and can be flaky,
      // so fall back to the token's open_id rather than aborting the connection.
      let profile: Awaited<ReturnType<typeof fetchTikTokUser>> | null = null;
      try {
        profile = await fetchTikTokUser(tokens.accessToken);
      } catch (e: any) {
        console.warn('[tiktok.callback] user/info failed, using token open_id', e?.message || e);
      }

      const openId = profile?.openId || tokens.openId;
      if (!openId) return fail('no_tiktok_account');

      await this.socialService.upsertOAuthAccount(parsed.organizationId, {
        platform: 'TIKTOK',
        accountId: openId,
        accountName: profile?.username || profile?.displayName || `tiktok_${openId.slice(0, 8)}`,
        profileImageUrl: profile?.avatarUrl,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          openId,
          accessExpiresAt: tokens.expiresAt.toISOString(),
          refreshExpiresAt: tokens.refreshExpiresAt?.toISOString(),
        },
        // Store what TikTok granted, not what we asked for: a user can decline
        // individual scopes, and pretending otherwise breaks feature gating.
        scopes: tokens.scopes,
        expiresAt: tokens.expiresAt,
      });

      return res.redirect(`${webUrl}/settings/integrations?tiktok=connected`);
    } catch (e: any) {
      console.error('[tiktok.callback] failed', e?.message || e);
      return fail('exchange_failed');
    }
  }
}
