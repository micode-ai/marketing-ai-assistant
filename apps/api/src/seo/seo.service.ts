import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SeoService {
  constructor(private prisma: PrismaService) {}

  async findKeywords(scope: { projectId?: string; organizationId?: string; aggregated?: boolean }) {
    const where: any = {};

    if (scope.projectId) {
      where.projectId = scope.projectId;
    } else if (scope.organizationId && scope.aggregated) {
      where.organizationId = scope.organizationId;
    } else if (scope.organizationId) {
      where.organizationId = scope.organizationId;
      where.scope = 'ORGANIZATION';
    }

    return this.prisma.keyword.findMany({
      where,
      include: {
        rankHistory: {
          orderBy: { date: 'desc' },
          take: 30,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findKeyword(id: string) {
    const keyword = await this.prisma.keyword.findUnique({
      where: { id },
      include: {
        rankHistory: { orderBy: { date: 'desc' }, take: 90 },
      },
    });
    if (!keyword) throw new NotFoundException('Keyword not found');
    return keyword;
  }

  async createKeyword(dto: {
    projectId: string;
    keyword: string;
    searchVolume?: number;
    difficulty?: number;
    targetRank?: number;
    intent?: string;
    url?: string;
    organizationId?: string;
    scope?: string;
  }) {
    let organizationId = dto.organizationId;
    if (!organizationId && dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        select: { organizationId: true },
      });
      organizationId = project?.organizationId;
    }

    return this.prisma.keyword.create({
      data: {
        projectId: dto.projectId,
        organizationId,
        scope: (dto.scope || 'PROJECT') as any,
        keyword: dto.keyword,
        searchVolume: dto.searchVolume,
        difficulty: dto.difficulty,
        targetRank: dto.targetRank,
        intent: (dto.intent || 'INFORMATIONAL') as any,
        url: dto.url,
      },
    });
  }

  async updateKeyword(
    id: string,
    dto: {
      searchVolume?: number;
      difficulty?: number;
      currentRank?: number;
      targetRank?: number;
      intent?: string;
      url?: string;
      isTracking?: boolean;
    },
  ) {
    return this.prisma.keyword.update({
      where: { id },
      data: {
        ...(dto.searchVolume !== undefined && { searchVolume: dto.searchVolume }),
        ...(dto.difficulty !== undefined && { difficulty: dto.difficulty }),
        ...(dto.currentRank !== undefined && { currentRank: dto.currentRank }),
        ...(dto.targetRank !== undefined && { targetRank: dto.targetRank }),
        ...(dto.intent && { intent: dto.intent as any }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.isTracking !== undefined && { isTracking: dto.isTracking }),
      },
    });
  }

  async deleteKeyword(id: string) {
    return this.prisma.keyword.delete({ where: { id } });
  }

  async addRankHistory(keywordId: string, rank: number | null, url?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entry = await this.prisma.keywordRankHistory.upsert({
      where: { keywordId_date: { keywordId, date: today } },
      update: { rank, url },
      create: { keywordId, date: today, rank, url },
    });

    await this.prisma.keyword.update({
      where: { id: keywordId },
      data: { currentRank: rank ?? undefined },
    });

    return entry;
  }

  async getKeywordHistory(keywordId: string, days = 90) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.keywordRankHistory.findMany({
      where: { keywordId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
  }

  async findCompetitors(scope: { projectId?: string; organizationId?: string; aggregated?: boolean }) {
    const where: any = {};

    if (scope.projectId) {
      where.projectId = scope.projectId;
    } else if (scope.organizationId && scope.aggregated) {
      where.organizationId = scope.organizationId;
    } else if (scope.organizationId) {
      where.organizationId = scope.organizationId;
      where.scope = 'ORGANIZATION';
    }

    return this.prisma.competitor.findMany({
      where,
      include: {
        snapshots: { orderBy: { date: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCompetitor(dto: {
    projectId: string;
    name: string;
    websiteUrl: string;
    description?: string;
    organizationId?: string;
    scope?: string;
  }) {
    let organizationId = dto.organizationId;
    if (!organizationId && dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        select: { organizationId: true },
      });
      organizationId = project?.organizationId;
    }

    return this.prisma.competitor.create({
      data: {
        projectId: dto.projectId,
        organizationId,
        scope: (dto.scope || 'PROJECT') as any,
        name: dto.name,
        websiteUrl: dto.websiteUrl,
        description: dto.description,
      },
    });
  }

  async updateCompetitor(
    id: string,
    dto: { name?: string; websiteUrl?: string; description?: string; isActive?: boolean },
  ) {
    return this.prisma.competitor.update({ where: { id }, data: dto });
  }

  async deleteCompetitor(id: string) {
    return this.prisma.competitor.delete({ where: { id } });
  }

  async addCompetitorSnapshot(competitorId: string, data: Record<string, unknown>) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const previous = await this.prisma.competitorSnapshot.findFirst({
      where: { competitorId },
      orderBy: { date: 'desc' },
    });

    const changes = previous ? detectChanges(previous.data as Record<string, unknown>, data) : null;

    const snapshot = await this.prisma.competitorSnapshot.upsert({
      where: { competitorId_date: { competitorId, date: today } },
      update: { data: data as any, changes: changes as any },
      create: { competitorId, date: today, data: data as any, changes: changes as any },
    });

    await this.prisma.competitor.update({
      where: { id: competitorId },
      data: { lastCheckedAt: new Date() },
    });

    return snapshot;
  }
}

function detectChanges(
  prev: Record<string, unknown>,
  curr: Record<string, unknown>,
): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {};
  let hasChanges = false;

  for (const key of Object.keys(curr)) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(curr[key])) {
      changes[key] = { from: prev[key], to: curr[key] };
      hasChanges = true;
    }
  }

  return hasChanges ? changes : null;
}
