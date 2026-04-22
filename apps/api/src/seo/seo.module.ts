import { Module } from '@nestjs/common';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { CompetitorSuggestionService } from './competitor-suggestion.service';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CompetitorAccessGuard } from '../common/guards/competitor-access.guard';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [AgentModule],
  controllers: [SeoController],
  providers: [SeoService, CompetitorSuggestionService, ProjectAccessGuard, CompetitorAccessGuard],
  exports: [SeoService],
})
export class SeoModule {}
