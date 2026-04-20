import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@Injectable()
export class ContentService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    scope: { projectId?: string; organizationId?: string; aggregated?: boolean },
    filters?: { type?: string; status?: string; platform?: string; from?: string; to?: string },
  ) {
    const where: any = {
      ...(filters?.type && { type: filters.type as any }),
      ...(filters?.status && { status: filters.status as any }),
      ...(filters?.platform && { platform: filters.platform as any }),
    };

    const andClauses: any[] = [];

    if (scope.projectId) {
      where.projectId = scope.projectId;
    } else if (scope.organizationId && scope.aggregated) {
      andClauses.push({
        OR: [
          { organizationId: scope.organizationId },
          { project: { organizationId: scope.organizationId } },
        ],
      });
    } else if (scope.organizationId) {
      where.organizationId = scope.organizationId;
      where.scope = 'ORGANIZATION';
    }

    if (filters?.from || filters?.to) {
      const range: any = {};
      if (filters.from) range.gte = new Date(filters.from);
      if (filters.to) range.lte = new Date(filters.to);
      andClauses.push({
        OR: [
          { scheduledAt: range },
          { scheduledAt: null, createdAt: range },
        ],
      });
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    return this.prisma.content.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { versions: true } },
        campaign: { select: { id: true, name: true, startDate: true, endDate: true } },
        project: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string) {
    const content = await this.prisma.content.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!content) throw new NotFoundException('Content not found');
    return content;
  }

  async create(dto: CreateContentDto, _userId: string) {
    let organizationId = (dto as any).organizationId;
    if (!organizationId && dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        select: { organizationId: true },
      });
      organizationId = project?.organizationId;
    }

    const scheduling = !!dto.scheduledAt || !!dto.scheduledPublicationAccountIds?.length;
    if (scheduling) {
      if (!dto.scheduledAt || !dto.scheduledPublicationAccountIds?.length) {
        throw new BadRequestException('scheduledAt and scheduledPublicationAccountIds must be provided together');
      }
      if (new Date(dto.scheduledAt).getTime() <= Date.now()) {
        throw new BadRequestException('scheduledAt must be in the future');
      }
      const attached = await this.prisma.socialAccount.findMany({
        where: {
          id: { in: dto.scheduledPublicationAccountIds },
          organizationId,                                  // defense in depth: never cross orgs
          projects: { some: { projectId: dto.projectId! } },
        },
        select: { id: true, platform: true, language: true },
      });
      if (attached.length !== dto.scheduledPublicationAccountIds.length) {
        throw new BadRequestException('One or more selected social accounts are not attached to this project');
      }
      (dto as any).__attachedAccounts = attached;
    }

    // Wrap Content + ContentPublication inserts in a transaction so a publication-insert
    // failure does not leave an orphan SCHEDULED Content row with no publications.
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.content.create({
        data: {
          projectId: dto.projectId,
          organizationId,
          scope: (dto as any).scope || 'PROJECT',
          campaignId: dto.campaignId,
          type: dto.type as any,
          title: dto.title,
          body: dto.body,
          mediaUrls: dto.mediaUrls || [],
          platform: dto.platform as any,
          platforms: dto.platforms || [],
          scheduledAt: dto.scheduledAt,
          status: scheduling ? 'SCHEDULED' : undefined,
          aiGenerated: dto.aiGenerated || false,
          language: dto.language || undefined,
          contentGroupId: dto.contentGroupId || undefined,
        },
      });

      if (scheduling) {
        const groupRows = created.contentGroupId
          ? await tx.content.findMany({
              where: { contentGroupId: created.contentGroupId },
              select: { id: true, language: true },
            })
          : [{ id: created.id, language: created.language }];

        const pickContentId = (accLang: string | null) => {
          const lang = accLang || 'en';
          const match = groupRows.find(r => r.language === lang);
          return (match?.id) || created.id;
        };

        const accs = (dto as any).__attachedAccounts as Array<{ id: string; platform: string; language: string | null }>;
        // Defensive: if a duplicate PENDING row for the same (contentId, socialAccountId)
        // already exists (e.g., a retried multi-call), skip rather than throw.
        const candidates = accs.map(a => ({
          contentId: pickContentId(a.language),
          socialAccountId: a.id,
          platform: a.platform as any,
          status: 'PENDING' as const,
        }));
        const existing = await tx.contentPublication.findMany({
          where: { status: 'PENDING', socialAccountId: { in: candidates.map(c => c.socialAccountId) }, contentId: { in: candidates.map(c => c.contentId) } },
          select: { contentId: true, socialAccountId: true },
        });
        const dupKey = (c: { contentId: string; socialAccountId: string }) => `${c.contentId}:${c.socialAccountId}`;
        const seen = new Set(existing.map(dupKey));
        const toCreate = candidates.filter(c => !seen.has(dupKey(c)));
        if (toCreate.length > 0) {
          await tx.contentPublication.createMany({ data: toCreate });
        }
      }

      return created;
    });
  }

  async update(id: string, dto: UpdateContentDto, userId: string) {
    const content = await this.prisma.content.findUnique({ where: { id } });
    if (!content) throw new NotFoundException('Content not found');

    // Save version before update
    if (dto.body && dto.body !== content.body) {
      const lastVersion = await this.prisma.contentVersion.count({ where: { contentId: id } });
      await this.prisma.contentVersion.create({
        data: {
          contentId: id,
          version: lastVersion + 1,
          body: content.body,
          editedBy: userId,
        },
      });
    }

    return this.prisma.content.update({ where: { id }, data: dto as any });
  }

  async delete(id: string) {
    return this.prisma.content.delete({ where: { id } });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.content.update({
      where: { id },
      data: {
        status: status as any,
        publishedAt: status === 'PUBLISHED' ? new Date() : undefined,
      },
    });
  }

  async repurpose(id: string, targetType: string, _userId: string) {
    const source = await this.prisma.content.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Source content not found');

    return this.prisma.content.create({
      data: {
        projectId: source.projectId,
        organizationId: source.organizationId,
        scope: source.scope,
        campaignId: source.campaignId,
        sourceContentId: source.id,
        type: targetType as any,
        title: `[Repurposed] ${source.title}`,
        body: source.body,
        mediaUrls: source.mediaUrls,
        aiGenerated: false,
      },
    });
  }

  async getPerformance(projectId: string, days?: number) {
    const d = Number(days) || 30;
    const since = new Date(Date.now() - d * 24 * 60 * 60 * 1000);

    const [contents, events] = await Promise.all([
      this.prisma.content.findMany({
        where: { projectId, status: 'PUBLISHED' },
        select: { id: true, title: true, type: true, publishedAt: true, seoMetadata: true },
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.analyticsEvent.findMany({
        where: {
          projectId,
          timestamp: { gte: since },
          type: { in: ['PAGE_VIEW', 'CONVERSION', 'SOCIAL_ENGAGEMENT'] },
        },
        select: { type: true, metadata: true },
      }),
    ]);

    // Build URL → event counts map
    const urlStats: Record<string, { views: number; conversions: number; engagements: number }> = {};
    for (const event of events) {
      const meta = event.metadata as any;
      const url = meta?.url || meta?.path || '';
      let path: string;
      try { path = new URL(url).pathname; } catch { path = url; }
      if (!path) continue;

      if (!urlStats[path]) urlStats[path] = { views: 0, conversions: 0, engagements: 0 };
      if (event.type === 'PAGE_VIEW') urlStats[path]!.views++;
      else if (event.type === 'CONVERSION') urlStats[path]!.conversions++;
      else if (event.type === 'SOCIAL_ENGAGEMENT') urlStats[path]!.engagements++;
    }

    // Match content to URL stats by slug from seoMetadata or title-based slug
    return contents.map(content => {
      const seo = content.seoMetadata as any;
      const slug = seo?.suggestedSlug || content.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      // Find matching URL stats
      let views = 0, conversions = 0, engagements = 0;
      for (const [path, stats] of Object.entries(urlStats)) {
        if (path.includes(slug)) {
          views += stats.views;
          conversions += stats.conversions;
          engagements += stats.engagements;
        }
      }

      const score = Math.min(100, Math.round(
        (views * 0.3 + conversions * 20 + engagements * 2) / Math.max(1, views) * 10
      ));

      return {
        id: content.id,
        title: content.title,
        type: content.type,
        publishedAt: content.publishedAt,
        views,
        conversions,
        engagements,
        score,
      };
    }).sort((a, b) => b.score - a.score);
  }
}
