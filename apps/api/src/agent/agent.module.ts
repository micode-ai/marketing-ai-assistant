import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentQueueProcessor } from './agent.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'agent' }),
  ],
  controllers: [AgentController],
  providers: [AgentService, AgentQueueProcessor],
  exports: [AgentService],
})
export class AgentModule {}
