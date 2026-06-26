import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { MetaOAuthService } from './meta-oauth.service';
import { SocialService } from '../social/social.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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

  @Get('auth-url')
  getAuthUrl(@CurrentUser() user: any, @Query('platform') platform: string) {
    const organizationId: string = user.memberships?.[0]?.organizationId;
    if (!organizationId) throw new BadRequestException('No organization');
    if (platform !== 'INSTAGRAM') throw new BadRequestException('Unsupported platform');
    const state = Buffer.from(JSON.stringify({ organizationId, platform })).toString('base64');
    return { url: this.metaService.getInstagramAuthUrl(this.redirectUri(), state) };
  }

  @Get('callback')
  @Public()
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const webUrl = (this.config.get('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
    const fail = (reason: string) => res.redirect(`${webUrl}/settings/integrations?instagram=error&reason=${reason}`);

    let parsed: { organizationId: string; platform: string };
    try {
      parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    } catch {
      return fail('bad_state');
    }
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
