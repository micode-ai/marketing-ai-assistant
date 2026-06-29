import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    projectId: string,
    opts: { contactId?: string; dealId?: string; companyId?: string; type?: string },
  ) {
    const where: any = { projectId };
    if (opts.contactId) where.contactId = opts.contactId;
    if (opts.dealId) where.dealId = opts.dealId;
    if (opts.companyId) where.companyId = opts.companyId;
    if (opts.type) where.type = opts.type;
    return this.prisma.activity.findMany({
      where,
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { occurredAt: 'desc' },
    });
  }

  async create(projectId: string, dto: any) {
    return this.prisma.activity.create({
      data: {
        projectId,
        type: dto.type,
        body: dto.body,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        ownerId: dto.ownerId ?? null,
        contactId: dto.contactId ?? null,
        dealId: dto.dealId ?? null,
        companyId: dto.companyId ?? null,
      },
    });
  }

  async update(projectId: string, id: string, dto: any) {
    const existing = await this.prisma.activity.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Activity not found');
    const data: any = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.occurredAt !== undefined) data.occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : null;
    return this.prisma.activity.update({ where: { id }, data });
  }

  async remove(projectId: string, id: string) {
    const existing = await this.prisma.activity.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Activity not found');
    await this.prisma.activity.delete({ where: { id } });
    return { deleted: true as const };
  }
}
