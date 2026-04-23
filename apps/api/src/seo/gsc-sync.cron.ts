import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { GscSyncService } from './gsc-sync.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GscSyncCronService {
  private readonly logger = new Logger(GscSyncCronService.name);

  constructor(
    private prisma: PrismaService,
    private gscSync: GscSyncService,
    private cronFailureNotifier: CronFailureNotifier,
    private config: ConfigService,
  ) {}

  @Cron('0 3 * * *') // 03:00 UTC daily
  async runDaily() {
    await this.run(new Date());
  }

  async run(now: Date) {
    this.logger.log('GSC rank sync cron started');

    // Find all projects with a Google integration
    const projects = await this.prisma.project.findMany({
      where: {
        apiKeys: { some: { platform: 'GOOGLE' } },
      },
      include: {
        apiKeys: { where: { platform: 'GOOGLE' } },
        organization: { select: { id: true, name: true, plan: true } },
      },
    });

    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday

    for (const project of projects) {
      const apiKey = project.apiKeys[0];
      if (!apiKey) continue;

      // Parse config to check if siteUrl is set
      let config: Record<string, unknown> | null = null;
      try {
        config = JSON.parse(Buffer.from(apiKey.encryptedKey, 'base64').toString('utf-8'));
      } catch {
        continue;
      }

      // Only process keys that have siteUrl configured
      if (!config?.siteUrl) continue;

      const plan = project.organization.plan;

      // Plan-based cadence:
      // FREE: weekly on Mondays only
      // PRO / ENTERPRISE: daily
      if (plan === 'FREE' && dayOfWeek !== 1) {
        this.logger.debug(`Skipping project ${project.id} (FREE plan, not Monday)`);
        continue;
      }

      try {
        const summary = await this.gscSync.syncProject(project.id);
        this.logger.log(
          `GSC sync for project ${project.id}: matched=${summary.matched}, skipped=${summary.skipped.length}`,
        );
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        const errorCode = (e as any)?.response?.code || 'GSC_SYNC_ERROR';
        this.logger.error(`GSC sync failed for project ${project.id}: ${errorMsg}`);

        const webUrl = this.config.get('WEB_URL') || 'http://localhost:5173';
        await this.cronFailureNotifier.report({
          organizationId: project.organization.id,
          cronName: 'gsc-sync',
          resourceType: 'PROJECT',
          resourceId: project.id,
          resourceLabel: project.name,
          errorCode,
          error: errorMsg,
          actionUrl: `${webUrl}/projects/${project.id}/settings`,
        });
      }
    }

    this.logger.log('GSC rank sync cron finished');
  }
}
