import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AgentService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('agent') private agentQueue: Queue,
  ) {}

  async runAgent(dto: { projectId: string; agentType: string; input: Record<string, unknown>; userId?: string }) {
    const input = dto.userId ? { ...dto.input, userId: dto.userId } : dto.input;
    const run = await this.prisma.agentRun.create({
      data: {
        projectId: dto.projectId,
        agentType: dto.agentType as any,
        status: 'PENDING',
        input: input as any,
      },
    });

    await this.agentQueue.add('run', { runId: run.id, projectId: dto.projectId, agentType: dto.agentType, input });
    return run;
  }

  async getRuns(projectId: string) {
    return this.prisma.agentRun.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getRunById(id: string) {
    const run = await this.prisma.agentRun.findUnique({ where: { id } });
    if (!run) return null;
    return {
      ...run,
      langsmithTraceUrl: run.langsmithTraceUrl ?? null,
    };
  }

  async getSchedules(projectId: string) {
    return this.prisma.agentSchedule.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSchedule(dto: {
    projectId: string;
    agentType: string;
    cronExpression: string;
    config?: Record<string, unknown>;
  }) {
    const nextRunAt = new Date(Date.now() + 60 * 60 * 1000);
    return this.prisma.agentSchedule.create({
      data: {
        projectId: dto.projectId,
        agentType: dto.agentType as any,
        cronExpression: dto.cronExpression,
        config: (dto.config as any) || {},
        nextRunAt,
      },
    });
  }

  async updateSchedule(id: string, dto: { cronExpression?: string; isActive?: boolean; config?: Record<string, unknown> }) {
    return this.prisma.agentSchedule.update({
      where: { id },
      data: dto as any,
    });
  }

  async deleteSchedule(id: string) {
    return this.prisma.agentSchedule.delete({ where: { id } });
  }

  async chat(dto: { projectId?: string; message: string; history?: any[] }) {
    // Will be replaced by actual LangChain integration in ai-agent service
    // For now, forward to ai-agent microservice via HTTP
    const agentUrl = process.env.AI_AGENT_URL || 'http://localhost:3001';
    try {
      const response = await fetch(`${agentUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });
      return response.json();
    } catch {
      return { message: 'AI agent service is unavailable. Please try again later.' };
    }
  }
}
