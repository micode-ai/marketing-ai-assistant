import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { AgentService } from './agent.service';

@Injectable()
export class AgentScheduleProcessor {
  private readonly logger = new Logger(AgentScheduleProcessor.name);
  private processing = false;

  constructor(
    private prisma: PrismaService,
    private agentService: AgentService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processSchedules() {
    if (this.processing) return;
    this.processing = true;

    try {
      const now = new Date();
      const dueSchedules = await this.prisma.agentSchedule.findMany({
        where: {
          isActive: true,
          nextRunAt: { lte: now },
        },
        include: { project: true },
      });

      for (const schedule of dueSchedules) {
        try {
          this.logger.log(
            `Running scheduled agent ${schedule.agentType} for project ${schedule.projectId}`,
          );

          await this.agentService.runAgent({
            projectId: schedule.projectId,
            agentType: schedule.agentType,
            input: (schedule.config as Record<string, unknown>) || {},
          });

          const nextRunAt = this.calculateNextRun(schedule.cronExpression);

          await this.prisma.agentSchedule.update({
            where: { id: schedule.id },
            data: {
              lastRunAt: now,
              nextRunAt,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Schedule ${schedule.id} failed: ${msg}`,
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private calculateNextRun(cronExpression: string): Date {
    // Simple cron parser for common patterns
    // Format: minute hour dayOfMonth month dayOfWeek
    const parts = cronExpression.trim().split(/\s+/);
    const now = new Date();

    if (parts.length !== 5) {
      // Default: 1 hour from now
      return new Date(now.getTime() + 60 * 60 * 1000);
    }

    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

    // Every N minutes: */N * * * *
    if (minute.startsWith('*/') && hour === '*') {
      const interval = parseInt(minute.slice(2), 10) || 60;
      return new Date(now.getTime() + interval * 60 * 1000);
    }

    // Every N hours: 0 */N * * *
    if (hour.startsWith('*/')) {
      const interval = parseInt(hour.slice(2), 10) || 1;
      return new Date(now.getTime() + interval * 60 * 60 * 1000);
    }

    // Daily at specific time: M H * * *
    if (dayOfMonth === '*' && dayOfWeek === '*' && !minute.includes('*') && !hour.includes('*')) {
      const next = new Date(now);
      next.setHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next;
    }

    // Weekly: M H * * D
    if (dayOfMonth === '*' && dayOfWeek !== '*' && !minute.includes('*') && !hour.includes('*')) {
      const targetDay = parseInt(dayOfWeek, 10);
      const next = new Date(now);
      next.setHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
      const daysUntil = (targetDay - now.getDay() + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntil);
      return next;
    }

    // Default: next day
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}
