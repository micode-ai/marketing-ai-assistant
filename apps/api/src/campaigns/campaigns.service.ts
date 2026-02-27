import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService) {}

  async findAll(projectId: string) {
    return this.prisma.campaign.findMany({
      where: { projectId },
      include: { _count: { select: { content: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { content: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async create(dto: any) {
    return this.prisma.campaign.create({ data: { ...dto, type: dto.type as any } });
  }

  async update(id: string, dto: any) {
    return this.prisma.campaign.update({ where: { id }, data: dto as any });
  }

  async delete(id: string) {
    return this.prisma.campaign.delete({ where: { id } });
  }
}
