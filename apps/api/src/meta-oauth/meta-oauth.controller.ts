import { Controller, Get, Query, Res, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as crypto from 'crypto';
import { MetaOAuthService } from './meta-oauth.service';
import { SocialService } from '../social/social.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const STATE_TTL_MS = 600_000; // 10 minutes

@ApiTags('meta')
@ApiBearerAuth()
@Controller('meta')
export class MetaOAuthController {
  constructor(
    private metaService: MetaOAuthService,
    private socialService: SocialService,
    private config: ConfigService,
  ) {}

  private redirectUri(): string {
    const apiUrl = this.config.get('API_URL') || 'http://localhost:3000';
    return `${apiUrl}/api/meta/callback`;
  }

  private signState(payload: object): string {
    const secret = this.config.get('ENCRYPTION_KEY') || '';
    const body = Buffer.from(JSON.stringify({ ...payload, ts: Date.now() })).toString('base64url');
    const sig = Buffer.from(
      crypto.createHmac('sha256', secret).update(body).digest(),
    ).toString('base64url');
    return `${body}.${sig}`;
  }

  private verifyState(state: string): { organizationId: string; platform: string } | null {
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
      return { organizationId: parsed.organizationId, platform: parsed.platform };
    } catch {
      return null;
    }
  }

  @Get('auth-url')
  getAuthUrl(
    @CurrentUser() user: any,
    @Query('platform') platform: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const memberships = user.memberships || [];
    const membership = organizationId
      ? memberships.find((m: any) => m.organizationId === organizationId)
      : memberships[0];
    if (!membership) throw new BadRequestException('No organization');
    if (!['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new ForbiddenException('Only OWNER or ADMIN can connect social accounts');
    }
    const orgId = membership.organizationId;
    if (platform !== 'INSTAGRAM') throw new BadRequestException('Unsupported platform');
    const state = this.signState({ organizationId: orgId, platform });
    return { url: this.metaService.getInstagramAuthUrl(this.redirectUri(), state) };
  }

  @Get('callback')
  @Public()
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const webUrl = (this.config.get('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
    const fail = (reason: string) => res.redirect(`${webUrl}/settings/integrations?instagram=error&reason=${reason}`);

    const parsed = this.verifyState(state);
    if (!parsed) return fail('bad_state');
    if (!code) return fail('no_code');

    try {
      const short = await this.metaService.exchangeCode(code, this.redirectUri());
      const long = await this.metaService.getLongLivedToken(short.access_token);
      const ig = await this.metaService.discoverInstagramAccount(long.access_token);
      if (!ig) return fail('no_ig_account');

      await this.socialService.upsertOAuthAccount(parsed.organizationId, {
        platform: 'INSTAGRAM',
        accountId: ig.igUserId,
        accountName: ig.username,
        profileImageUrl: ig.profilePictureUrl,
        tokens: {
          accessToken: ig.pageAccessToken,
          userAccessToken: long.access_token,
          igUserId: ig.igUserId,
          pageId: ig.pageId,
        },
        scopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights', 'instagram_manage_comments'],
        expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
      });

      return res.redirect(`${webUrl}/settings/integrations?instagram=connected`);
    } catch (e: any) {
      this.failLog(e);
      return fail('exchange_failed');
    }
  }

  private failLog(e: any) {
    console.error('[meta-oauth.callback] failed', e?.message || e);
  }
}
