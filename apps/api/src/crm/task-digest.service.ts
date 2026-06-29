import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';
import type { DigestTask } from '../mail/task-digest-email';

@Injectable()
export class TaskDigestService {
  private readonly logger = new Logger(TaskDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifier: CronFailureNotifier,
  ) {}

  @Cron('0 7 * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Starting daily CRM task digest');
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const webUrl = (process.env.WEB_URL || 'http://localhost:5173').replace(/\/$/, '');

    const projects = await this.prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, organizationId: true },
    });

    for (const project of projects) {
      try {
        const tasks = await this.prisma.task.findMany({
          where: {
            projectId: project.id,
            status: 'OPEN',
            ownerId: { not: null },
            dueDate: { not: null, lt: startOfTomorrow },
          },
          include: {
            owner: { select: { id: true, email: true, language: true, name: true } },
            contact: { select: { firstName: true, lastName: true } },
            deal: { select: { title: true } },
          },
        });
        if (tasks.length === 0) continue;

        const byOwner = new Map<string, { email: string; language: string; tasks: any[] }>();
        for (const t of tasks) {
          if (!t.owner?.email) continue;
          const g = byOwner.get(t.owner.id) ?? { email: t.owner.email, language: t.owner.language || 'en', tasks: [] };
          g.tasks.push(t);
          byOwner.set(t.owner.id, g);
        }

        for (const [, g] of byOwner) {
          const overdue: DigestTask[] = [];
          const today: DigestTask[] = [];
          for (const t of g.tasks) {
            const linked =
              t.contact ? [t.contact.firstName, t.contact.lastName].filter(Boolean).join(' ') :
              t.deal ? t.deal.title : null;
            const item: DigestTask = { title: t.title, dueDate: t.dueDate, linked };
            if (new Date(t.dueDate) < startOfToday) overdue.push(item);
            else today.push(item);
          }
          await this.mail.sendTaskDigest({
            to: g.email,
            language: g.language,
            projectName: project.name,
            overdue,
            today,
          });
        }
      } catch (error) {
        this.logger.error(`CRM task digest failed for project ${project.id}: ${error}`);
        await this.notifier.report({
          organizationId: project.organizationId,
          cronName: 'crm-task-digest',
          resourceType: 'Project',
          resourceId: project.id,
          resourceLabel: project.name,
          errorCode: 'CRM_TASK_DIGEST_FAILED',
          error: error instanceof Error ? error.message : String(error),
          actionUrl: `${webUrl}/projects/${project.id}/crm/tasks`,
        });
      }
    }
  }
}
