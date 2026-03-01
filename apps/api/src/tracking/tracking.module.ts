import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { TrackingProcessor } from './tracking.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'tracking' })],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingProcessor],
  exports: [TrackingService],
})
export class TrackingModule {}
