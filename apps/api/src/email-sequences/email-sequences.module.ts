import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { EmailSequencesController } from './email-sequences.controller';
import { EmailSequencesService } from './email-sequences.service';
import { EmailSequenceProcessor } from './email-sequences.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'email-sequence' })],
  controllers: [EmailSequencesController],
  providers: [EmailSequencesService, EmailSequenceProcessor],
  exports: [EmailSequencesService],
})
export class EmailSequencesModule {}
