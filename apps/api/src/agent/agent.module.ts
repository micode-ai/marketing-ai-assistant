import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentQueueProcessor } from './agent.processor';
import { AgentScheduleProcessor } from './agent-schedule.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'agent' }),
  ],
  controllers: [AgentController],
  providers: [AgentService, AgentQueueProcessor, AgentScheduleProcessor],
  exports: [AgentService],
})
export class AgentModule {}
