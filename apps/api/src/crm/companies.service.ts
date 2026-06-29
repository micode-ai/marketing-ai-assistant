import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string, opts: { search?: string }) {
    const where: any = { projectId };
    if (opts.search) where.name = { contains: opts.search, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        include: { _count: { select: { contacts: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.company.count({ where }),
    ]);
    return { items, total };
  }

  async get(projectId: string, id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, projectId },
      include: { contacts: { orderBy: { updatedAt: 'desc' } } },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async create(projectId: string, dto: any) {
    return this.prisma.company.create({
      data: {
        projectId,
        name: dto.name,
        domain: dto.domain ?? null,
        website: dto.website ?? null,
        notes: dto.notes ?? null,
        ownerId: dto.ownerId ?? null,
      },
    });
  }

  async update(projectId: string, id: string, dto: any) {
    const existing = await this.prisma.company.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Company not found');
    const data: any = {};
    for (const k of ['name', 'domain', 'website', 'notes', 'ownerId']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    return this.prisma.company.update({ where: { id }, data });
  }

  async remove(projectId: string, id: string) {
    const existing = await this.prisma.company.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Company not found');
    await this.prisma.company.delete({ where: { id } });
    return { deleted: true as const };
  }
}
