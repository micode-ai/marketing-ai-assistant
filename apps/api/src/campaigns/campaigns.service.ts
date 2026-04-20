import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const CONTENT_STATUSES = ['DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED'] as const;
const EMAIL_STATUSES = ['draft', 'scheduled', 'sent'] as const;

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService) {}

  async findAll(scope: { projectId?: string; organizationId?: string; aggregated?: boolean }) {
    const where: any = {};

    if (scope.projectId) {
      where.projectId = scope.projectId;
    } else if (scope.organizationId && scope.aggregated) {
      where.organizationId = scope.organizationId;
    } else if (scope.organizationId) {
      where.organizationId = scope.organizationId;
      where.scope = 'ORGANIZATION';
    }

    return this.prisma.campaign.findMany({
      where,
      include: { _count: { select: { content: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        content: true,
        emailCampaigns: {
          include: {
            list: { select: { id: true, name: true } },
            emailAccount: { select: { id: true, email: true, displayName: true } },
          },
        },
        documents: {
          include: { document: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const contentByStatus = Object.fromEntries(CONTENT_STATUSES.map(s => [s, 0])) as Record<string, number>;
    for (const c of campaign.content) contentByStatus[c.status] = (contentByStatus[c.status] ?? 0) + 1;

    const emailByStatus = Object.fromEntries(EMAIL_STATUSES.map(s => [s, 0])) as Record<string, number>;
    for (const e of campaign.emailCampaigns) emailByStatus[e.status] = (emailByStatus[e.status] ?? 0) + 1;

    const documents = campaign.documents.map(cd => cd.document);

    return {
      ...campaign,
      documents,
      progress: {
        content: { total: campaign.content.length, byStatus: contentByStatus },
        email:   { total: campaign.emailCampaigns.length, byStatus: emailByStatus },
      },
    };
  }

  async create(dto: any) {
    let organizationId = dto.organizationId;
    if (!organizationId && dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        select: { organizationId: true },
      });
      organizationId = project?.organizationId;
    }

    return this.prisma.campaign.create({
      data: {
        ...dto,
        type: dto.type as any,
        organizationId,
        scope: dto.scope || 'PROJECT',
      },
    });
  }

  async update(id: string, dto: any) {
    return this.prisma.campaign.update({ where: { id }, data: dto as any });
  }

  async delete(id: string) {
    return this.prisma.campaign.delete({ where: { id } });
  }

  private async loadCampaignOrThrow(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: { id: true, projectId: true, organizationId: true, scope: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async attachContent(id: string, contentIds: string[]) {
    const campaign = await this.loadCampaignOrThrow(id);
    if (!contentIds.length) return this.findOne(id);

    const rows = await this.prisma.content.findMany({
      where: { id: { in: contentIds } },
      select: { id: true, projectId: true, organizationId: true, campaignId: true },
    });
    const scopeKey = campaign.scope === 'ORGANIZATION' ? 'organizationId' : 'projectId';
    const scopeVal = campaign.scope === 'ORGANIZATION' ? campaign.organizationId : campaign.projectId;

    const wrongScope = rows.filter(r => (r as any)[scopeKey] !== scopeVal);
    if (wrongScope.length) {
      throw new BadRequestException(`Content out of scope: ${wrongScope.map(r => r.id).join(',')}`);
    }

    const alreadyTaken = rows.filter(r => r.campaignId && r.campaignId !== id);
    if (alreadyTaken.length) {
      throw new ConflictException(`Already attached: ${alreadyTaken.map(r => r.id).join(',')}`);
    }

    await this.prisma.content.updateMany({
      where: { id: { in: contentIds } },
      data: { campaignId: id },
    });
    return this.findOne(id);
  }

  async detachContent(id: string, contentIds: string[]) {
    await this.loadCampaignOrThrow(id);
    if (!contentIds.length) return this.findOne(id);
    await this.prisma.content.updateMany({
      where: { id: { in: contentIds }, campaignId: id },
      data: { campaignId: null },
    });
    return this.findOne(id);
  }

  async attachEmails(id: string, emailIds: string[]) {
    const campaign = await this.loadCampaignOrThrow(id);
    if (!emailIds.length) return this.findOne(id);

    const rows = await this.prisma.emailCampaign.findMany({
      where: { id: { in: emailIds } },
      select: {
        id: true,
        campaignId: true,
        list: { select: { projectId: true, organizationId: true } },
      },
    });
    const scopeKey = campaign.scope === 'ORGANIZATION' ? 'organizationId' : 'projectId';
    const scopeVal = campaign.scope === 'ORGANIZATION' ? campaign.organizationId : campaign.projectId;

    const wrongScope = rows.filter(r => (r.list as any)?.[scopeKey] !== scopeVal);
    if (wrongScope.length) {
      throw new BadRequestException(`Emails out of scope: ${wrongScope.map(r => r.id).join(',')}`);
    }

    const alreadyTaken = rows.filter(r => r.campaignId && r.campaignId !== id);
    if (alreadyTaken.length) {
      throw new ConflictException(`Already attached: ${alreadyTaken.map(r => r.id).join(',')}`);
    }

    await this.prisma.emailCampaign.updateMany({
      where: { id: { in: emailIds } },
      data: { campaignId: id },
    });
    return this.findOne(id);
  }

  async detachEmails(id: string, emailIds: string[]) {
    await this.loadCampaignOrThrow(id);
    if (!emailIds.length) return this.findOne(id);
    await this.prisma.emailCampaign.updateMany({
      where: { id: { in: emailIds }, campaignId: id },
      data: { campaignId: null },
    });
    return this.findOne(id);
  }

  async availableContent(id: string, search?: string) {
    const campaign = await this.loadCampaignOrThrow(id);
    const scope = campaign.scope === 'ORGANIZATION'
      ? { organizationId: campaign.organizationId! }
      : { projectId: campaign.projectId! };
    const where: any = { ...scope, campaignId: null };
    if (search) where.title = { contains: search, mode: 'insensitive' };
    return this.prisma.content.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100 });
  }

  async attachDocuments(id: string, documentIds: string[]) {
    const campaign = await this.loadCampaignOrThrow(id);
    if (!documentIds.length) return this.findOne(id);

    const rows = await this.prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, projectId: true, organizationId: true },
    });
    if (rows.length !== documentIds.length) {
      throw new BadRequestException('One or more documents not found');
    }

    const scopeKey = campaign.scope === 'ORGANIZATION' ? 'organizationId' : 'projectId';
    const scopeVal = campaign.scope === 'ORGANIZATION' ? campaign.organizationId : campaign.projectId;

    const wrongScope = rows.filter(r => (r as any)[scopeKey] !== scopeVal);
    if (wrongScope.length) {
      throw new BadRequestException(`Documents out of scope: ${wrongScope.map(r => r.id).join(',')}`);
    }

    await this.prisma.campaignDocument.createMany({
      data: documentIds.map(documentId => ({ campaignId: id, documentId })),
      skipDuplicates: true,
    });
    return this.findOne(id);
  }

  async detachDocuments(id: string, documentIds: string[]) {
    await this.loadCampaignOrThrow(id);
    if (!documentIds.length) return this.findOne(id);
    await this.prisma.campaignDocument.deleteMany({
      where: { campaignId: id, documentId: { in: documentIds } },
    });
    return this.findOne(id);
  }

  async availableDocuments(id: string, search?: string) {
    const campaign = await this.loadCampaignOrThrow(id);
    const scope = campaign.scope === 'ORGANIZATION'
      ? { organizationId: campaign.organizationId! }
      : { projectId: campaign.projectId! };

    const attached = await this.prisma.campaignDocument.findMany({
      where: { campaignId: id },
      select: { documentId: true },
    });
    const excludeIds = attached.map(a => a.documentId);

    const where: any = { ...scope };
    if (excludeIds.length) where.id = { notIn: excludeIds };
    if (search) where.title = { contains: search, mode: 'insensitive' };
    return this.prisma.document.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100 });
  }

  async availableEmails(id: string, search?: string) {
    const campaign = await this.loadCampaignOrThrow(id);
    const listScope = campaign.scope === 'ORGANIZATION'
      ? { organizationId: campaign.organizationId! }
      : { projectId: campaign.projectId! };
    const where: any = { campaignId: null, list: listScope };
    if (search) where.subject = { contains: search, mode: 'insensitive' };
    return this.prisma.emailCampaign.findMany({
      where,
      include: {
        list: { select: { id: true, name: true } },
        emailAccount: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
