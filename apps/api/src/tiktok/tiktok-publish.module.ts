import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TikTokOAuthService } from './tiktok-oauth.service';
import { TikTokTokenService } from './tiktok-token.service';
import { TikTokPublishService } from './tiktok-publish.service';

/**
 * TikTok services that other modules consume, deliberately split from
 * TikTokModule: SocialModule needs the publish service, while TikTokModule's
 * OAuth controller needs SocialService. Keeping the shared services in a module
 * that does not import SocialModule breaks what would otherwise be a circular
 * dependency requiring forwardRef on both sides.
 */
@Module({
  imports: [DatabaseModule],
  providers: [TikTokOAuthService, TikTokTokenService, TikTokPublishService],
  exports: [TikTokOAuthService, TikTokTokenService, TikTokPublishService],
})
export class TikTokPublishModule {}
