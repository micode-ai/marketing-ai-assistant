import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class DealInsightsService {
  private readonly logger = new Logger(DealInsightsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private clamp(n: unknown): number {
    const x = typeof n === 'number' ? n : Number(n);
    if (!Number.isFinite(x)) return 50;
    return Math.max(0, Math.min(100, Math.round(x)));
  }

  async generate(projectId: string, dealId: string, language: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, projectId },
      include: { stage: { select: { name: true, probability: true } }, contact: { select: { firstName: true, lastName: true } } },
    });
    if (!deal) throw new NotFoundException('Deal not found');

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const [activities, open, overdue] = await Promise.all([
      this.prisma.activity.findMany({
        where: { dealId },
        orderBy: { occurredAt: 'desc' },
        take: 10,
        select: { type: true, occurredAt: true, body: true },
      }),
      this.prisma.task.count({ where: { dealId, status: 'OPEN' } }),
      this.prisma.task.count({ where: { dealId, status: 'OPEN', dueDate: { lt: startOfToday } } }),
    ]);

    const contactName = deal.contact
      ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(' ').trim() || null
      : null;
    const ageDays = Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / 86400000);

    const payload = {
      language,
      deal: {
        title: deal.title,
        value: Number(deal.value),
        currency: deal.currency,
        stageName: deal.stage?.name,
        stageProbability: deal.stage?.probability,
        status: deal.status,
        ageDays,
      },
      activities: activities.map((a) => ({ type: a.type, occurredAt: new Date(a.occurredAt).toISOString().slice(0, 10), body: a.body })),
      tasks: { open, overdue },
      contact: contactName ? { name: contactName } : null,
    };

    const agentUrl = process.env.AI_AGENT_URL || 'http://localhost:3001';
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(`${agentUrl}/deal-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      this.logger.error(`Deal insights request failed: ${e}`);
      throw new BadRequestException('Failed to reach the AI agent');
    }
    if (!response.ok) {
      this.logger.error(`Deal insights agent returned ${response.status}`);
      throw new BadRequestException('AI agent returned an error');
    }
    const data = (await response.json()) as {
      score: number; scoreReason: string; nextStep: string; draftSubject?: string; draftBody: string;
    };

    const now = new Date();
    const fields = {
      score: this.clamp(data.score),
      scoreReason: data.scoreReason ?? '',
      nextStep: data.nextStep ?? '',
      draftSubject: data.draftSubject ?? null,
      draftBody: data.draftBody ?? '',
      language,
      generatedAt: now,
    };
    return this.prisma.dealInsight.upsert({
      where: { dealId },
      create: { dealId, ...fields },
      update: fields,
    });
  }

  async get(projectId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({ where: { id: dealId, projectId }, select: { id: true } });
    if (!deal) throw new NotFoundException('Deal not found');
    return this.prisma.dealInsight.findUnique({ where: { dealId } });
  }
}
