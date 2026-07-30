import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SocialModule } from '../social/social.module';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { TikTokPublishModule } from './tiktok-publish.module';
import { TikTokOAuthController } from './tiktok-oauth.controller';
import { TikTokController } from './tiktok.controller';
import { TikTokService } from './tiktok.service';
import { TikTokSyncService } from './tiktok-sync.service';
import { TikTokTokenRefreshService } from './tiktok-token-refresh.service';

@Module({
  imports: [DatabaseModule, SocialModule, TikTokPublishModule],
  controllers: [TikTokOAuthController, TikTokController],
  providers: [
    TikTokService,
    TikTokSyncService,
    TikTokTokenRefreshService,
    ProjectAccessGuard,
  ],
  exports: [TikTokService],
})
export class TikTokModule {}
