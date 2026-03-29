import { Module } from '@nestjs/common';
import { EntityLinksController } from './entity-links.controller';
import { EntityLinksService } from './entity-links.service';

@Module({
  controllers: [EntityLinksController],
  providers: [EntityLinksService],
  exports: [EntityLinksService],
})
export class EntityLinksModule {}
