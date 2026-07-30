import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { SocialService } from './social.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';

@Injectable()
export class SocialSchedulerService {
  private readonly logger = new Logger(SocialSchedulerService.name);
  private processing = false;

  constructor(
    private prisma: PrismaService,
    private social: SocialService,
    private notifier: CronFailureNotifier,
    private config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    await this.processDue();
  }

  async processDue() {
    if (this.processing) return;
    this.processing = true;
    try {
      const now = new Date();
      const due = await this.prisma.contentPublication.findMany({
        where: { status: 'PENDING', content: { scheduledAt: { lte: now } } },
        include: { content: true, socialAccount: true },
        orderBy: { content: { scheduledAt: 'asc' } },
        take: 50,
      });

      const succeededContentIds = new Set<string>();

      for (const pub of due) {
        const r = await this.social.publishToAccount(pub.content, pub.socialAccount);
        if (r.status === 'PUBLISHED') {
          await this.prisma.contentPublication.updateMany({
            where: { id: pub.id, status: 'PENDING' },
            data: {
              status: 'PUBLISHED',
              platformPostId: r.platformPostId,
              platformPostUrl: r.platformPostUrl,
              publishedAt: new Date(),
            },
          });
          succeededContentIds.add(pub.content.id);
        } else {
          await this.prisma.contentPublication.updateMany({
            where: { id: pub.id, status: 'PENDING' },
            data: { status: 'FAILED', error: r.error },
          });

          // Avoid double emails: an already-skipped account carries the fixed
          // reauth message, and a token error detected mid-publish (Meta or
          // TikTok) was already reported by SocialService itself.
          const isReauthSkip = r.error === 'Account requires reauthentication';
          if (!isReauthSkip && !r.reported) {
            const webUrl = (this.config.get<string>('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
            await this.notifier.report({
              organizationId: pub.socialAccount.organizationId,
              cronName: 'social-scheduler',
              resourceType: 'ContentPublication',
              resourceId: pub.id,
              resourceLabel: `${pub.socialAccount.platform}: ${pub.socialAccount.accountName}`,
              errorCode: 'PUBLISH_FAILED',
              error: r.error || 'Unknown',
              actionUrl: `${webUrl}/projects/${pub.content.projectId}/content/${pub.content.id}`,
            });
          }
        }
      }

      for (const contentId of succeededContentIds) {
        await this.prisma.content.update({
          where: { id: contentId },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
      }

      if (due.length > 0) this.logger.log(`Processed ${due.length} scheduled publication(s)`);
    } catch (err: any) {
      this.logger.error('Scheduler tick failed', err?.stack || err?.message || err);
    } finally {
      this.processing = false;
    }
  }
}
