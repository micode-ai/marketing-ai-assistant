import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@Injectable()
export class ContentService {
  constructor(private prisma: PrismaService) {}

  async findAll(projectId: string, filters?: { type?: string; status?: string; platform?: string; from?: string; to?: string }) {
    const where: any = {
      projectId,
      ...(filters?.type && { type: filters.type as any }),
      ...(filters?.status && { status: filters.status as any }),
      ...(filters?.platform && { platform: filters.platform as any }),
    };

    if (filters?.from || filters?.to) {
      const range: any = {};
      if (filters.from) range.gte = new Date(filters.from);
      if (filters.to) range.lte = new Date(filters.to);
      where.OR = [
        { scheduledAt: range },
        { scheduledAt: null, createdAt: range },
      ];
    }

    return this.prisma.content.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { versions: true } },
        campaign: { select: { id: true, name: true, startDate: true, endDate: true } },
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
    return this.prisma.content.create({
      data: {
        projectId: dto.projectId,
        campaignId: dto.campaignId,
        type: dto.type as any,
        title: dto.title,
        body: dto.body,
        mediaUrls: dto.mediaUrls || [],
        platform: dto.platform as any,
        scheduledAt: dto.scheduledAt,
        aiGenerated: dto.aiGenerated || false,
      },
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
}
