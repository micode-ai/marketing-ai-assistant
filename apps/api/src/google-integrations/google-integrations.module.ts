import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GoogleIntegrationsController } from './google-integrations.controller';
import { GoogleIntegrationsService } from './google-integrations.service';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [GoogleIntegrationsController],
  providers: [GoogleIntegrationsService, ProjectAccessGuard],
  exports: [GoogleIntegrationsService],
})
export class GoogleIntegrationsModule {}
