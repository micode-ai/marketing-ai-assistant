import { Module } from '@nestjs/common';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { CseConfigService } from './cse-config.service';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';

@Module({
  controllers: [SeoController],
  providers: [SeoService, CseConfigService, ProjectAccessGuard],
  exports: [SeoService, CseConfigService],
})
export class SeoModule {}
