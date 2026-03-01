import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { PrismaService } from '../database/prisma.service';

@Processor('tracking')
export class TrackingProcessor {
  constructor(private prisma: PrismaService) {}

  @Process('web-event')
  async handleWebEvent(job: Job) {
    const { tid, type, name, url, referrer, ua, ip, utm, meta, sid } = job.data;

    const project = await this.prisma.project.findFirst({
      where: { trackingId: tid },
      select: { id: true },
    });
    if (!project) return;

    let eventType: string;
    if (type === 'page_view') eventType = 'PAGE_VIEW';
    else if (type === 'conversion') eventType = 'CONVERSION';
    else eventType = 'PAGE_VIEW';

    await this.prisma.analyticsEvent.create({
      data: {
        projectId: project.id,
        type: eventType as any,
        metadata: {
          url,
          referrer,
          userAgent: ua,
          ip: Array.isArray(ip) ? ip[0] : ip,
          sessionId: sid,
          eventName: name,
          utm: utm || {},
          ...(meta || {}),
        },
      },
    });
  }

  @Process('email-open')
  async handleEmailOpen(job: Job) {
    const { trackingId, ip, ua } = job.data;
    const data = this.decodeTrackingId(trackingId);
    if (!data) return;

    const { ec: emailCampaignId, s: subscriberId, p: projectId } = data;

    await this.prisma.analyticsEvent.create({
      data: {
        projectId,
        type: 'EMAIL_OPEN' as any,
        metadata: {
          emailCampaignId,
          subscriberId,
          ip: Array.isArray(ip) ? ip[0] : ip,
          userAgent: ua,
        },
      },
    });

    await this.incrementEmailStat(emailCampaignId, 'opens');
  }

  @Process('email-click')
  async handleEmailClick(job: Job) {
    const { trackingId, ip, ua } = job.data;
    const data = this.decodeTrackingId(trackingId);
    if (!data) return;

    const { ec: emailCampaignId, s: subscriberId, p: projectId, url } = data;

    await this.prisma.analyticsEvent.create({
      data: {
        projectId,
        type: 'EMAIL_CLICK' as any,
        metadata: {
          emailCampaignId,
          subscriberId,
          url,
          ip: Array.isArray(ip) ? ip[0] : ip,
          userAgent: ua,
        },
      },
    });

    await this.incrementEmailStat(emailCampaignId, 'clicks');
  }

  private async incrementEmailStat(emailCampaignId: string, field: 'opens' | 'clicks') {
    try {
      const campaign = await this.prisma.emailCampaign.findUnique({
        where: { id: emailCampaignId },
        select: { stats: true },
      });
      if (!campaign) return;

      const stats = (campaign.stats as any) || { sent: 0, opens: 0, clicks: 0, bounces: 0, unsubscribes: 0 };
      stats[field] = (stats[field] || 0) + 1;

      await this.prisma.emailCampaign.update({
        where: { id: emailCampaignId },
        data: { stats },
      });
    } catch (err) {
      console.error(`Failed to update email campaign stat ${field}:`, err);
    }
  }

  private decodeTrackingId(encoded: string): Record<string, string> | null {
    try {
      return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    } catch {
      return null;
    }
  }
}
