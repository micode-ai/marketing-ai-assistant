import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { CronName } from '../mail/cron-failure-email';

export interface ReportFailureInput {
  organizationId: string;
  cronName: CronName;
  resourceType: string;
  resourceId: string;
  resourceLabel: string;
  errorCode: string;
  error: string;
  actionUrl: string;
}

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ERROR_SAMPLE = 2000;

@Injectable()
export class CronFailureNotifier {
  private readonly logger = new Logger(CronFailureNotifier.name);

  constructor(private prisma: PrismaService, private mail: MailService) {}

  async report(input: ReportFailureInput): Promise<void> {
    try {
      const signature = [
        input.cronName,
        input.resourceType,
        input.resourceId,
        input.errorCode,
      ].join(':');

      const errorSample = input.error.substring(0, MAX_ERROR_SAMPLE);

      const row = await this.prisma.cronFailureNotification.upsert({
        where: {
          organizationId_signature: {
            organizationId: input.organizationId,
            signature,
          },
        },
        create: {
          organizationId: input.organizationId,
          signature,
          errorSample,
        },
        update: {
          occurrences: { increment: 1 },
          lastSeenAt: new Date(),
          errorSample,
        },
      });

      const shouldSend =
        !row.lastSentAt ||
        Date.now() - new Date(row.lastSentAt).getTime() >= DEDUP_WINDOW_MS;

      if (!shouldSend) return;

      const [org, members] = await Promise.all([
        this.prisma.organization.findUnique({
          where: { id: input.organizationId },
        }),
        this.prisma.organizationMember.findMany({
          where: {
            organizationId: input.organizationId,
            role: { in: ['OWNER', 'ADMIN'] },
            joinedAt: { not: null },
          },
          include: { user: true },
        }),
      ]);

      if (!org) {
        this.logger.warn(
          `Cannot send cron failure email: org ${input.organizationId} not found`,
        );
        return;
      }

      for (const m of members) {
        if (!m.user?.email) continue;
        try {
          await this.mail.sendCronFailure({
            to: m.user.email,
            language: m.user.language || 'en',
            cronName: input.cronName,
            resourceLabel: input.resourceLabel,
            error: errorSample,
            actionUrl: input.actionUrl,
            occurrences: row.occurrences,
            firstSeenAt: row.firstSeenAt,
            organizationName: org.name,
          });
        } catch (e) {
          this.logger.error(
            `Failed to send cron failure email to ${m.user.email}`,
            e as Error,
          );
        }
      }

      await this.prisma.cronFailureNotification.update({
        where: { id: row.id },
        data: { lastSentAt: new Date() },
      });
    } catch (e) {
      this.logger.error('CronFailureNotifier.report failed', e as Error);
    }
  }
}
