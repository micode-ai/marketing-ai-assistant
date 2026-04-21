import { Module } from '@nestjs/common';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { CseConfigService } from './cse-config.service';
import { RankTrackingService } from './rank-tracking.service';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { KeywordAccessGuard } from '../common/guards/keyword-access.guard';

@Module({
  controllers: [SeoController],
  providers: [SeoService, CseConfigService, RankTrackingService, ProjectAccessGuard, KeywordAccessGuard],
  exports: [SeoService, CseConfigService, RankTrackingService],
})
export class SeoModule {}
