import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AgentService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('agent') private agentQueue: Queue,
  ) {}

  /** Throws unless `user` (the JWT user, with memberships) belongs to the project's organization. */
  async assertProjectAccess(user: any, projectId: string | undefined): Promise<void> {
    if (!projectId || typeof projectId !== 'string') throw new BadRequestException('projectId is required');
    if (!user) throw new ForbiddenException('Not authenticated');
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
    if (!project) throw new NotFoundException('Project not found');
    const member = user.memberships?.some((m: any) => m.organizationId === project.organizationId);
    if (!member) throw new ForbiddenException('No access to this project');
  }

  /** Same check for a bare user id (the internal chat-agent path, which has no JWT user). */
  async assertUserIdProjectAccess(userId: string | undefined, projectId: string | undefined): Promise<void> {
    if (!userId || typeof userId !== 'string') throw new BadRequestException('userId is required');
    if (!projectId || typeof projectId !== 'string') throw new BadRequestException('projectId is required');
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
    if (!project) throw new NotFoundException('Project not found');
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: project.organizationId },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException('No access to this project');
  }

  async assertScheduleAccess(user: any, scheduleId: string): Promise<void> {
    const schedule = await this.prisma.agentSchedule.findUnique({ where: { id: scheduleId }, select: { projectId: true } });
    if (!schedule) throw new NotFoundException('Schedule not found');
    await this.assertProjectAccess(user, schedule.projectId);
  }

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

    console.log('[AgentService] Enqueueing agent run:', run.id, 'queue isReady:', typeof this.agentQueue.isReady);
    this.agentQueue.add('run', { runId: run.id, projectId: dto.projectId, agentType: dto.agentType, input })
      .then(job => console.log('[AgentService] Job added:', job.id))
      .catch(err => console.error('[AgentService] Failed to enqueue agent run:', err));
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
    // Only the editable fields — never spread the raw body (projectId, nextRunAt, … must not be writable).
    const data: Record<string, unknown> = {};
    if (dto?.cronExpression !== undefined) data.cronExpression = dto.cronExpression;
    if (dto?.isActive !== undefined) data.isActive = dto.isActive;
    if (dto?.config !== undefined) data.config = dto.config;
    return this.prisma.agentSchedule.update({
      where: { id },
      data: data as any,
    });
  }

  async deleteSchedule(id: string) {
    return this.prisma.agentSchedule.delete({ where: { id } });
  }

  async chat(dto: { projectId?: string; message: string; history?: any[] }, userId?: string) {
    // Will be replaced by actual LangChain integration in ai-agent service
    // For now, forward to ai-agent microservice via HTTP
    const agentUrl = process.env.AI_AGENT_URL || 'http://localhost:3001';
    try {
      const response = await fetch(`${agentUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dto, userId }),
      });
      return response.json();
    } catch {
      return { message: 'AI agent service is unavailable. Please try again later.' };
    }
  }
}
