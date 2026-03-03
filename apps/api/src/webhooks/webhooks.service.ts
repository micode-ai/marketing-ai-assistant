import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.webhook.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: { organizationId: string; url: string; events: string[] }) {
    const secret = crypto.randomBytes(32).toString('hex');
    return this.prisma.webhook.create({
      data: {
        organizationId: dto.organizationId,
        url: dto.url,
        events: dto.events,
        secret,
      },
    });
  }

  async update(id: string, dto: { url?: string; events?: string[]; isActive?: boolean }) {
    return this.prisma.webhook.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    return this.prisma.webhook.delete({ where: { id } });
  }

  /**
   * Emit a webhook event to all matching active webhooks for the organization.
   */
  async emit(organizationId: string, eventType: string, payload: Record<string, unknown>) {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        organizationId,
        isActive: true,
        events: { has: eventType },
      },
    });

    const results: Array<{ webhookId: string; success: boolean; error?: string }> = [];

    for (const webhook of webhooks) {
      try {
        const body = JSON.stringify({
          event: eventType,
          timestamp: new Date().toISOString(),
          data: payload,
        });

        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(body)
          .digest('hex');

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': eventType,
          },
          body,
          signal: globalThis.AbortSignal.timeout(10000),
        });

        results.push({ webhookId: webhook.id, success: response.ok });

        await this.prisma.webhook.update({
          where: { id: webhook.id },
          data: { lastTriggeredAt: new Date() },
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Webhook ${webhook.id} failed: ${errorMsg}`);
        results.push({ webhookId: webhook.id, success: false, error: errorMsg });
      }
    }

    return results;
  }

  async sendTestEvent(id: string) {
    const webhook = await this.prisma.webhook.findUniqueOrThrow({ where: { id } });
    const body = JSON.stringify({
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test event' },
    });

    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex');

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': 'webhook.test',
      },
      body,
      signal: globalThis.AbortSignal.timeout(10000),
    });

    return { success: response.ok, status: response.status };
  }
}
