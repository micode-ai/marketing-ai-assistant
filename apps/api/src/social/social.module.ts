import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialSchedulerService } from './social-scheduler.service';
import { TikTokPublishModule } from '../tiktok/tiktok-publish.module';

@Module({
  imports: [TikTokPublishModule],
  controllers: [SocialController],
  providers: [SocialService, SocialSchedulerService],
  exports: [SocialService],
})
export class SocialModule {}
