import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GooglePlayController } from './google-play.controller';
import { GooglePlayAuthService } from './google-play-auth.service';
import { GooglePlayMetricsService } from './google-play-metrics.service';
import { GooglePlayReviewsService } from './google-play-reviews.service';
import { GooglePlaySyncService } from './google-play-sync.service';
import { ProjectAccessGuard } from './guards/project-access.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [GooglePlayController],
  providers: [
    GooglePlayAuthService,
    GooglePlayMetricsService,
    GooglePlayReviewsService,
    GooglePlaySyncService,
    ProjectAccessGuard,
  ],
  exports: [GooglePlayAuthService],
})
export class GooglePlayModule {}
