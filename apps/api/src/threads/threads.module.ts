import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';
import { ThreadsSyncService } from './threads-sync.service';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [ThreadsController],
  providers: [ThreadsService, ThreadsSyncService, ProjectAccessGuard],
  exports: [ThreadsService],
})
export class ThreadsModule {}
