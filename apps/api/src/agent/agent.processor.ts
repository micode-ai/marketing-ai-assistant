import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { PrismaService } from '../database/prisma.service';

@Processor('agent')
export class AgentQueueProcessor {
  constructor(private prisma: PrismaService) {}

  @Process('run')
  async handleAgentRun(job: Job<{ runId: string; projectId: string; agentType: string; input: Record<string, unknown> }>) {
    const { runId, projectId, agentType, input } = job.data;

    await this.prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'RUNNING' },
    });

    try {
      const agentUrl = process.env.AI_AGENT_URL || 'http://localhost:3001';
      const response = await fetch(`${agentUrl}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, projectId, agentType, input }),
      });

      const result = await response.json() as { output?: unknown; tokensUsed?: number; cost?: number };

      await this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: 'COMPLETED',
          output: result.output as any || {},
          tokensUsed: result.tokensUsed,
          cost: result.cost,
        },
      });
    } catch (error) {
      await this.prisma.agentRun.update({
        where: { id: runId },
        data: { status: 'FAILED', error: String(error) },
      });
    }
  }
}
