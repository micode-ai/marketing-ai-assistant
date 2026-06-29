import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ContactsController } from './contacts.controller';
import { CompaniesController } from './companies.controller';
import { DealsController } from './deals.controller';
import { PipelineController } from './pipeline.controller';
import { ContactsService } from './contacts.service';
import { CompaniesService } from './companies.service';
import { ContactsSyncService } from './contacts-sync.service';
import { DealsService } from './deals.service';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ContactsController, CompaniesController, DealsController, PipelineController],
  providers: [ContactsService, CompaniesService, ContactsSyncService, DealsService, PipelineService, ProjectAccessGuard],
  exports: [ContactsSyncService],
})
export class CrmModule {}
