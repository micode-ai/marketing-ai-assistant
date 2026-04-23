import { Module } from '@nestjs/common';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { CompetitorSuggestionService } from './competitor-suggestion.service';
import { GscSyncService } from './gsc-sync.service';
import { GscSyncCronService } from './gsc-sync.cron';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CompetitorAccessGuard } from '../common/guards/competitor-access.guard';
import { AgentModule } from '../agent/agent.module';
import { GoogleIntegrationsModule } from '../google-integrations/google-integrations.module';

@Module({
  imports: [AgentModule, GoogleIntegrationsModule],
  controllers: [SeoController],
  providers: [
    SeoService,
    CompetitorSuggestionService,
    GscSyncService,
    GscSyncCronService,
    ProjectAccessGuard,
    CompetitorAccessGuard,
  ],
  exports: [SeoService],
})
export class SeoModule {}
