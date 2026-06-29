import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ContactsController } from './contacts.controller';
import { CompaniesController } from './companies.controller';
import { ContactsService } from './contacts.service';
import { CompaniesService } from './companies.service';
import { ContactsSyncService } from './contacts-sync.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ContactsController, CompaniesController],
  providers: [ContactsService, CompaniesService, ContactsSyncService, ProjectAccessGuard],
  exports: [ContactsSyncService],
})
export class CrmModule {}
