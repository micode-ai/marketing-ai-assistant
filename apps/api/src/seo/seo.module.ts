import { Module } from '@nestjs/common';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { CseConfigService } from './cse-config.service';
import { RankTrackingService } from './rank-tracking.service';
import { RankTrackingCronService } from './rank-tracking.cron';
import { CompetitorSuggestionService } from './competitor-suggestion.service';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { KeywordAccessGuard } from '../common/guards/keyword-access.guard';
import { CompetitorAccessGuard } from '../common/guards/competitor-access.guard';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [AgentModule],
  controllers: [SeoController],
  providers: [SeoService, CseConfigService, RankTrackingService, RankTrackingCronService, CompetitorSuggestionService, ProjectAccessGuard, KeywordAccessGuard, CompetitorAccessGuard],
  exports: [SeoService, CseConfigService, RankTrackingService],
})
export class SeoModule {}
