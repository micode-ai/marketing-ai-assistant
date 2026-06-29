import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PLAN_LIMITS } from '@marketing-ai/shared-types';
import { PipelineService } from './pipeline.service';

export interface ListDealsOpts {
  status?: string;
  stageId?: string;
  ownerId?: string;
  search?: string;
}

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
  ) {}

  private dealLimit(plan: string): number {
    const limit = (PLAN_LIMITS as any)[plan]?.deals ?? PLAN_LIMITS.FREE.deals;
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

  private async baseCurrency(projectId: string): Promise<string> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { baseCurrency: true },
    });
    return project?.baseCurrency || 'USD';
  }

  async list(projectId: string, opts: ListDealsOpts) {
    const where: any = { projectId };
    if (opts.status) where.status = opts.status;
    if (opts.stageId) where.stageId = opts.stageId;
    if (opts.ownerId) where.ownerId = opts.ownerId;
    if (opts.search) where.title = { contains: opts.search, mode: 'insensitive' };
    return this.prisma.deal.findMany({
      where,
      include: {
        stage: { select: { id: true, name: true, order: true, probability: true } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(projectId: string, id: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, projectId },
      include: { stage: true, contact: true, company: true },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  async create(projectId: string, dto: any) {
    const limit = this.dealLimit(await this.resolvePlan(projectId));
    const openCount = await this.prisma.deal.count({ where: { projectId, status: 'OPEN' } });
    if (openCount >= limit) {
      throw new ForbiddenException('Open-deal limit reached for your plan');
    }
    const stageId = dto.stageId ?? (await this.pipeline.firstStageId(projectId));
    const currency = await this.baseCurrency(projectId);
    return this.prisma.deal.create({
      data: {
        projectId,
        title: dto.title,
        value: dto.value ?? 0,
        currency,
        status: 'OPEN',
        stageId: stageId ?? null,
        ownerId: dto.ownerId ?? null,
        contactId: dto.contactId ?? null,
        companyId: dto.companyId ?? null,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null,
      },
    });
  }

  async update(projectId: string, id: string, dto: any) {
    const existing = await this.prisma.deal.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Deal not found');
    const data: any = {};
    for (const k of ['title', 'value', 'stageId', 'ownerId', 'contactId', 'companyId', 'lostReason']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.expectedCloseDate !== undefined) {
      data.expectedCloseDate = dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null;
    }
    return this.prisma.deal.update({ where: { id }, data });
  }

  async remove(projectId: string, id: string) {
    const existing = await this.prisma.deal.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Deal not found');
    await this.prisma.deal.delete({ where: { id } });
    return { deleted: true as const };
  }

  async forecast(projectId: string) {
    const openDeals = await this.prisma.deal.findMany({
      where: { projectId, status: 'OPEN' },
      select: { value: true, stage: { select: { probability: true } } },
    });
    let openValue = 0;
    let weightedValue = 0;
    for (const d of openDeals) {
      const v = Number(d.value);
      openValue += v;
      weightedValue += v * ((d.stage?.probability ?? 0) / 100);
    }
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 90);
    const wonAgg = await this.prisma.deal.findMany({
      where: { projectId, status: 'WON', wonAt: { gte: since } },
      select: { value: true },
    });
    const wonValuePeriod = wonAgg.reduce((s, d) => s + Number(d.value), 0);
    const lostCount = await this.prisma.deal.count({ where: { projectId, status: 'LOST' } });
    return {
      openCount: openDeals.length,
      openValue,
      weightedValue: Math.round(weightedValue * 100) / 100,
      wonValuePeriod,
      lostCount,
    };
  }
}
