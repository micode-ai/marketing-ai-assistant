import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ContactsController } from './contacts.controller';
import { CompaniesController } from './companies.controller';
import { DealsController } from './deals.controller';
import { PipelineController } from './pipeline.controller';
import { ActivitiesController } from './activities.controller';
import { TasksController } from './tasks.controller';
import { TimelineController } from './timeline.controller';
import { ContactsService } from './contacts.service';
import { CompaniesService } from './companies.service';
import { ContactsSyncService } from './contacts-sync.service';
import { DealsService } from './deals.service';
import { PipelineService } from './pipeline.service';
import { TaskDigestService } from './task-digest.service';
import { ActivitiesService } from './activities.service';
import { TasksService } from './tasks.service';
import { TimelineService } from './timeline.service';
import { DealInsightsService } from './deal-insights.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ContactsController, CompaniesController, DealsController, PipelineController, ActivitiesController, TasksController, TimelineController],
  providers: [ContactsService, CompaniesService, ContactsSyncService, DealsService, PipelineService, ProjectAccessGuard, TaskDigestService, ActivitiesService, TasksService, TimelineService, DealInsightsService],
  exports: [ContactsSyncService],
})
export class CrmModule {}
