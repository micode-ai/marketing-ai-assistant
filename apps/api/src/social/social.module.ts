import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialSchedulerService } from './social-scheduler.service';

@Module({
  controllers: [SocialController],
  providers: [SocialService, SocialSchedulerService],
  exports: [SocialService],
})
export class SocialModule {}
