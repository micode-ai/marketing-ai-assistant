import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';
import { PLAN_LIMITS } from '../common/plan-limits';

@Injectable()
export class ContactsSyncService {
  private readonly logger = new Logger(ContactsSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: CronFailureNotifier,
  ) {}

  private contactLimit(plan: string): number {
    const limit = (PLAN_LIMITS as any)[plan]?.contacts ?? PLAN_LIMITS.FREE.contacts;
    return limit === 'unlimited' ? Infinity : limit;
  }

  private async resolvePlan(projectId: string): Promise<string> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (!project) return 'FREE';
    const org = await this.prisma.organization.findUnique({
      where: { id: project.organizationId },
      include: { subscription: true },
    });
    return org?.subscription?.plan || 'FREE';
  }

  /**
   * Idempotently materialize contacts from the project's email subscribers and
   * identified (email-bearing) tracked users. Dedups by (projectId, email).
   * Never downgrades an existing contact's source and never overwrites a
   * non-null human field with a null/empty auto value. Stops creating new
   * contacts once the plan's contact cap is reached (existing ones still update).
   */
  async materialize(
    projectId: string,
  ): Promise<{ created: number; updated: number; capped: boolean }> {
    const limit = this.contactLimit(await this.resolvePlan(projectId));
    let count = await this.prisma.contact.count({ where: { projectId } });
    let created = 0;
    let updated = 0;
    let capped = false;

    const upsertByEmail = async (
      email: string,
      createData: Record<string, unknown>,
      updateData: Record<string, unknown>,
    ) => {
      const existing = await this.prisma.contact.findUnique({
        where: { projectId_email: { projectId, email } },
      });
      if (existing) {
        await this.prisma.contact.update({
          where: { id: existing.id },
          data: this.mergeUpdate(existing, updateData),
        });
        updated++;
        return;
      }
      if (count >= limit) {
        capped = true;
        return;
      }
      await this.prisma.contact.create({ data: { projectId, email, ...createData } });
      created++;
      count++;
    };

    // 1) Subscribers (active) — source SUBSCRIBER.
    const subscribers = await this.prisma.emailSubscriber.findMany({
      where: { list: { projectId }, status: { not: 'UNSUBSCRIBED' }, email: { not: '' } },
      select: { id: true, email: true, name: true },
    });
    for (const s of subscribers) {
      if (!s.email) continue;
      await upsertByEmail(
        s.email,
        { source: 'SUBSCRIBER', emailSubscriberId: s.id, firstName: s.name ?? null },
        { emailSubscriberId: s.id, firstName: s.name ?? null },
      );
    }

    // 2) Tracked users with an email — source TRACKED_USER + behavioural snapshot.
    const tracked = await this.prisma.trackedUser.findMany({
      where: { projectId, email: { not: null } },
      select: { id: true, email: true, lastSeen: true, firstUtm: true, lastUtm: true },
    });
    for (const t of tracked) {
      if (!t.email) continue;
      const snapshot = {
        trackedUserId: t.id,
        lastSeen: t.lastSeen ?? null,
        firstUtm: t.firstUtm ?? null,
        lastUtm: t.lastUtm ?? null,
      };
      await upsertByEmail(t.email, { source: 'TRACKED_USER', ...snapshot }, snapshot);
    }

    return { created, updated, capped };
  }

  @Cron('0 4 * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Starting daily CRM contact materialization');
    const projects = await this.prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, organizationId: true, name: true },
    });
    const webUrl = (process.env.WEB_URL || 'http://localhost:5173').replace(/\/$/, '');
    for (const project of projects) {
      try {
        await this.materialize(project.id);
      } catch (error) {
        this.logger.error(`CRM materialize failed for project ${project.id}: ${error}`);
        await this.notifier.report({
          organizationId: project.organizationId,
          cronName: 'crm-contacts-sync',
          resourceType: 'Project',
          resourceId: project.id,
          resourceLabel: project.name,
          errorCode: 'CRM_SYNC_FAILED',
          error: error instanceof Error ? error.message : String(error),
          actionUrl: `${webUrl}/projects/${project.id}/crm/contacts`,
        });
      }
    }
  }

  /**
   * Build the update payload: always refresh provenance + behavioural snapshot,
   * but never set `source` (so an existing source is never downgraded) and
   * protect human-entered fields (firstName/lastName/phone):
   *   - When the existing contact is MANUAL or IMPORT, the human-entered record
   *     is authoritative — human fields are NEVER overwritten by an auto value
   *     (null OR non-null). The behavioural snapshot still refreshes.
   *   - Otherwise (auto-materialized contact), a non-null/non-empty auto value
   *     may set a human field, but a null/empty value never clobbers an existing
   *     non-null one.
   */
  private mergeUpdate(
    existing: {
      source?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
    },
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    const humanAuthoritative = existing.source === 'MANUAL' || existing.source === 'IMPORT';
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (k === 'source') continue; // never downgrade
      const isHumanField = k === 'firstName' || k === 'lastName' || k === 'phone';
      if (isHumanField) {
        if (humanAuthoritative) continue; // curated record wins — never overwrite
        if (v === null || v === undefined || v === '') {
          if ((existing as any)[k]) continue; // keep the existing non-null human value
        }
      }
      out[k] = v;
    }
    return out;
  }
}
