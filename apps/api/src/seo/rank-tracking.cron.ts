import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { RankTrackingService } from './rank-tracking.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';

// ---------------------------------------------------------------------------
// Plan limits
// ---------------------------------------------------------------------------

type PlanCadence = 'weekly' | 'daily';

interface PlanLimits {
  cadence: PlanCadence;
  maxKeywords: number;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  FREE:       { cadence: 'weekly', maxKeywords: 5  },
  PRO:        { cadence: 'daily',  maxKeywords: 30 },
  ENTERPRISE: { cadence: 'daily',  maxKeywords: 90 },
};

const FREE_LIMITS: PlanLimits = PLAN_LIMITS['FREE'];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class RankTrackingCronService {
  private readonly logger = new Logger(RankTrackingCronService.name);

  constructor(
    private prisma: PrismaService,
    private rankTracking: RankTrackingService,
    private cronFailure: CronFailureNotifier,
  ) {}

  @Cron('0 3 * * *') // daily 03:00 UTC
  async runDaily(): Promise<void> {
    await this.run(new Date());
  }

  /** Extracted so tests can inject a fixed date. */
  async run(now: Date): Promise<void> {
    const integrations = await this.prisma.projectApiKey.findMany({
      where: { platform: 'GOOGLE_CSE' },
      include: {
        project: {
          include: {
            organization: {
              include: { subscription: true },
            },
          },
        },
      },
    });

    for (const integration of integrations) {
      const project = integration.project;
      const org = project?.organization;
      const plan: string = org?.subscription?.plan ?? org?.plan ?? 'FREE';
      const limits: PlanLimits = PLAN_LIMITS[plan] ?? FREE_LIMITS;

      // Weekly cadence: only run on Mondays (UTCDay === 1)
      if (limits.cadence === 'weekly' && now.getUTCDay() !== 1) {
        this.logger.log(
          `[rank-tracking] Skipping project ${project.id} (plan=${plan}, cadence=weekly, today is not Monday)`,
        );
        continue;
      }

      try {
        await this.runForProject(project.id, org.id, limits, now);
      } catch (err) {
        this.logger.error(
          `[rank-tracking] Batch-level error for project ${project.id}: ${(err as Error)?.message}`,
        );
        await this.cronFailure.report({
          cronName: 'rank-tracking',
          resourceType: 'PROJECT',
          resourceId: project.id,
          resourceLabel: project.name,
          organizationId: org.id,
          errorCode: this.mapError(err),
          error: err instanceof Error ? err.message : String(err),
          actionUrl: `${process.env.WEB_URL ?? ''}/projects/${project.id}/seo`,
        });
      }
    }
  }

  private async runForProject(
    projectId: string,
    organizationId: string,
    limits: PlanLimits,
    _now: Date,
  ): Promise<void> {
    const keywords = await this.prisma.keyword.findMany({
      where: {
        projectId,
        isTracking: true,
        url: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      take: limits.maxKeywords,
    });

    this.logger.log(
      `[rank-tracking] Checking ${keywords.length} keywords for project ${projectId}`,
    );

    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      try {
        await this.rankTracking.checkKeyword(keyword.id, 'cron');
      } catch (err) {
        this.logger.warn(
          `[rank-tracking] Keyword ${keyword.id} ("${keyword.keyword}") failed: ${(err as Error)?.message}`,
        );
      }

      // 500 ms courtesy delay between CSE calls (skip after last keyword)
      if (i < keywords.length - 1) {
        await this.sleep(500);
      }
    }
  }

  private mapError(err: any): string {
    if (err?.message?.includes('CSE_QUOTA_EXCEEDED')) return 'CSE_QUOTA_EXCEEDED';
    if (err?.message?.includes('CSE_INVALID_KEY')) return 'CSE_INVALID_KEY';
    return 'RANK_TRACKING_ERROR';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
