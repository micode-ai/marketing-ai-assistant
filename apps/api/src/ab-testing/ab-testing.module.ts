import { Module } from '@nestjs/common';
import { ABTestingController } from './ab-testing.controller';
import { ABTestingService } from './ab-testing.service';

@Module({
  controllers: [ABTestingController],
  providers: [ABTestingService],
  exports: [ABTestingService],
})
export class ABTestingModule {}
