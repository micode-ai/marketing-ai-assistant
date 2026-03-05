import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectExportService } from './project-export.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectExportService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
