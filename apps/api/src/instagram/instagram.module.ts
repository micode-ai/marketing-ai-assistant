import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { InstagramSyncService } from './instagram-sync.service';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [InstagramController],
  providers: [InstagramService, InstagramSyncService, ProjectAccessGuard],
  exports: [InstagramService],
})
export class InstagramModule {}
