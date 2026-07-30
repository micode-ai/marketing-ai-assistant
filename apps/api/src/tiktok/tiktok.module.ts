import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SocialModule } from '../social/social.module';
import { TikTokPublishModule } from './tiktok-publish.module';
import { TikTokOAuthController } from './tiktok-oauth.controller';
import { TikTokTokenRefreshService } from './tiktok-token-refresh.service';

@Module({
  imports: [DatabaseModule, SocialModule, TikTokPublishModule],
  controllers: [TikTokOAuthController],
  providers: [TikTokTokenRefreshService],
})
export class TikTokModule {}
