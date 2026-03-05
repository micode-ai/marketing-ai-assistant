import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type {
  ProjectExportData,
  ProjectExportSection,
  ImportValidationResult,
} from '@marketing-ai/shared-types';

const ALL_SECTIONS: ProjectExportSection[] = [
  'content', 'campaigns', 'checklists', 'documents', 'emailLists', 'keywords', 'competitors',
];

@Injectable()
export class ProjectExportService {
  constructor(private prisma: PrismaService) {}

  // ── Export ──

  async exportProject(
    projectId: string,
    userId: string,
    sectionsParam?: string,
  ): Promise<ProjectExportData> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    await this.checkAccess(project.organizationId, userId);

    const sections: ProjectExportSection[] = sectionsParam
      ? (sectionsParam.split(',').filter((s) => ALL_SECTIONS.includes(s as any)) as ProjectExportSection[])
      : ALL_SECTIONS;

    const result: ProjectExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sections,
      project: {
        name: project.name,
        projectType: project.projectType,
        description: project.description ?? undefined,
        websiteUrl: project.websiteUrl ?? undefined,
        logoUrl: project.logoUrl ?? undefined,
        targetAudience: project.targetAudience ?? undefined,
        brandVoice: project.brandVoice as any ?? undefined,
        industry: project.industry ?? undefined,
        goals: project.goals as any ?? undefined,
        socialLinks: project.socialLinks as any ?? undefined,
        status: project.status,
      },
    };

    if (sections.includes('content')) {
      const items = await this.prisma.content.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
      });
      result.content = items.map((c) => ({
        title: c.title,
        body: c.body,
        type: c.type,
        platform: c.platform ?? undefined,
        status: c.status,
        mediaUrls: c.mediaUrls,
        seoMetadata: c.seoMetadata as any ?? undefined,
        aiGenerated: c.aiGenerated,
      }));
    }

    if (sections.includes('campaigns')) {
      const items = await this.prisma.campaign.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
      });
      result.campaigns = items.map((c) => ({
        name: c.name,
        type: c.type,
        status: c.status,
        startDate: c.startDate?.toISOString(),
        endDate: c.endDate?.toISOString(),
        budget: c.budget ?? undefined,
        goals: c.goals ?? undefined,
      }));
    }

    if (sections.includes('checklists')) {
      const items = await this.prisma.checklist.findMany({
        where: { projectId },
        include: { items: { orderBy: { order: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      });
      result.checklists = items.map((ch) => ({
        name: ch.name,
        type: ch.type,
        description: ch.description ?? undefined,
        isTemplate: ch.isTemplate,
        items: ch.items.map((it) => ({
          title: it.title,
          description: it.description ?? undefined,
          order: it.order,
          priority: it.priority,
          isCompleted: it.isCompleted,
        })),
      }));
    }

    if (sections.includes('documents')) {
      const items = await this.prisma.document.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
      });
      result.documents = items.map((d) => ({
        title: d.title,
        type: d.type,
        content: d.content as any ?? undefined,
        contentMd: d.contentMd ?? undefined,
        generatedByAi: d.generatedByAi,
      }));
    }

    if (sections.includes('emailLists')) {
      const lists = await this.prisma.emailList.findMany({
        where: { projectId },
        include: { subscribers: true },
        orderBy: { createdAt: 'asc' },
      });
      result.emailLists = lists.map((l) => ({
        name: l.name,
        description: l.description ?? undefined,
        subscribers: l.subscribers.map((s) => ({
          email: s.email,
          name: s.name ?? undefined,
          status: s.status,
          metadata: s.metadata as any ?? undefined,
        })),
      }));
    }

    if (sections.includes('keywords')) {
      const items = await this.prisma.keyword.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
      });
      result.keywords = items.map((k) => ({
        keyword: k.keyword,
        searchVolume: k.searchVolume,
        difficulty: k.difficulty,
        currentRank: k.currentRank,
        targetRank: k.targetRank,
        intent: k.intent,
        url: k.url,
        isTracking: k.isTracking,
      }));
    }

    if (sections.includes('competitors')) {
      const items = await this.prisma.competitor.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
      });
      result.competitors = items.map((c) => ({
        name: c.name,
        websiteUrl: c.websiteUrl,
        description: c.description,
        isActive: c.isActive,
      }));
    }

    return result;
  }

  // ── Validate ──

  validateImport(data: unknown): ImportValidationResult {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Invalid JSON structure'], projectName: '', summary: {} };
    }

    const d = data as any;

    if (d.version !== 1) {
      errors.push('Unsupported export version');
    }
    if (!d.project || !d.project.name) {
      errors.push('Missing project name');
    }
    if (!d.sections || !Array.isArray(d.sections)) {
      errors.push('Missing sections list');
    }

    const summary: Partial<Record<ProjectExportSection, number>> = {};
    for (const section of ALL_SECTIONS) {
      if (d[section] && Array.isArray(d[section])) {
        summary[section] = d[section].length;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      projectName: d.project?.name || '',
      summary,
    };
  }

  // ── Import ──

  async importProject(
    organizationId: string,
    userId: string,
    data: ProjectExportData,
    sections: ProjectExportSection[],
  ) {
    await this.checkAccess(organizationId, userId);

    const validation = this.validateImport(data);
    if (!validation.valid) {
      throw new BadRequestException(validation.errors.join('; '));
    }

    return this.prisma.$transaction(async (tx) => {
      // Create project
      const project = await tx.project.create({
        data: {
          organizationId,
          name: data.project.name,
          projectType: data.project.projectType as any || 'WEBSITE',
          description: data.project.description,
          websiteUrl: data.project.websiteUrl,
          logoUrl: data.project.logoUrl,
          targetAudience: data.project.targetAudience,
          brandVoice: data.project.brandVoice as any,
          industry: data.project.industry,
          goals: data.project.goals as any,
          socialLinks: data.project.socialLinks as any,
          status: 'ACTIVE',
        },
      });

      // Import campaigns (before content, since content may reference campaigns)
      const campaignMap = new Map<number, string>(); // index -> new ID
      if (sections.includes('campaigns') && data.campaigns?.length) {
        for (let i = 0; i < data.campaigns.length; i++) {
          const c = data.campaigns[i];
          const created = await tx.campaign.create({
            data: {
              projectId: project.id,
              name: c.name,
              type: c.type as any || 'EMAIL',
              status: c.status as any || 'DRAFT',
              startDate: c.startDate ? new Date(c.startDate) : undefined,
              endDate: c.endDate ? new Date(c.endDate) : undefined,
              budget: c.budget,
              goals: c.goals,
            },
          });
          campaignMap.set(i, created.id);
        }
      }

      if (sections.includes('content') && data.content?.length) {
        for (const c of data.content) {
          await tx.content.create({
            data: {
              projectId: project.id,
              title: c.title,
              body: c.body,
              type: c.type as any || 'BLOG_ARTICLE',
              platform: c.platform as any || undefined,
              status: c.status as any || 'DRAFT',
              mediaUrls: c.mediaUrls || [],
              seoMetadata: c.seoMetadata as any,
              aiGenerated: c.aiGenerated ?? false,
            },
          });
        }
      }

      if (sections.includes('checklists') && data.checklists?.length) {
        for (const ch of data.checklists) {
          await tx.checklist.create({
            data: {
              projectId: project.id,
              name: ch.name,
              type: ch.type as any || 'CUSTOM',
              description: ch.description,
              isTemplate: ch.isTemplate ?? false,
              items: {
                create: (ch.items || []).map((it, idx) => ({
                  title: it.title,
                  description: it.description,
                  order: it.order ?? idx,
                  priority: it.priority as any || 'MEDIUM',
                  isCompleted: it.isCompleted ?? false,
                })),
              },
            },
          });
        }
      }

      if (sections.includes('documents') && data.documents?.length) {
        for (const d of data.documents) {
          await tx.document.create({
            data: {
              projectId: project.id,
              title: d.title,
              type: d.type as any || 'REPORT',
              content: d.content as any,
              contentMd: d.contentMd,
              generatedByAi: d.generatedByAi ?? false,
              createdBy: userId,
            },
          });
        }
      }

      if (sections.includes('emailLists') && data.emailLists?.length) {
        for (const list of data.emailLists) {
          await tx.emailList.create({
            data: {
              projectId: project.id,
              name: list.name,
              description: list.description,
              subscriberCount: list.subscribers?.length || 0,
              subscribers: {
                create: (list.subscribers || []).map((s) => ({
                  email: s.email,
                  name: s.name,
                  status: s.status as any || 'ACTIVE',
                  metadata: s.metadata as any,
                })),
              },
            },
          });
        }
      }

      if (sections.includes('keywords') && data.keywords?.length) {
        for (const k of data.keywords) {
          await tx.keyword.create({
            data: {
              projectId: project.id,
              keyword: k.keyword,
              searchVolume: k.searchVolume,
              difficulty: k.difficulty,
              currentRank: k.currentRank,
              targetRank: k.targetRank,
              intent: k.intent as any || 'INFORMATIONAL',
              url: k.url,
              isTracking: k.isTracking ?? true,
            },
          });
        }
      }

      if (sections.includes('competitors') && data.competitors?.length) {
        for (const c of data.competitors) {
          await tx.competitor.create({
            data: {
              projectId: project.id,
              name: c.name,
              websiteUrl: c.websiteUrl,
              description: c.description,
              isActive: c.isActive ?? true,
            },
          });
        }
      }

      return tx.project.findUnique({
        where: { id: project.id },
        include: {
          _count: { select: { campaigns: true, content: true, checklists: true, emailLists: true } },
        },
      });
    });
  }

  private async checkAccess(organizationId: string, userId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!member) throw new ForbiddenException('Access denied');
  }
}
