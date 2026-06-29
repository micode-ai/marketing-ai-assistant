import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PLAN_LIMITS } from '@marketing-ai/shared-types';

export interface ListContactsOpts {
  page?: number;
  pageSize?: number;
  search?: string;
  tag?: string;
  status?: string;
  ownerId?: string;
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private contactLimit(plan: string): number {
    const limit = (PLAN_LIMITS as any)[plan]?.contacts ?? PLAN_LIMITS.FREE.contacts;
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

  async list(projectId: string, opts: ListContactsOpts) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
    const where: any = { projectId };
    if (opts.status) where.status = opts.status;
    if (opts.tag) where.tags = { has: opts.tag };
    if (opts.ownerId) where.ownerId = opts.ownerId;
    if (opts.search) {
      const q = opts.search;
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        include: { company: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(projectId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, projectId },
      include: { company: true },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async create(projectId: string, dto: any) {
    const limit = this.contactLimit(await this.resolvePlan(projectId));
    const count = await this.prisma.contact.count({ where: { projectId } });
    if (count >= limit) {
      throw new ForbiddenException('Contact limit reached for your plan');
    }
    return this.prisma.contact.create({
      data: {
        projectId,
        email: dto.email ?? null,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        phone: dto.phone ?? null,
        companyId: dto.companyId ?? null,
        ownerId: dto.ownerId ?? null,
        tags: dto.tags ?? [],
        notes: dto.notes ?? null,
        source: 'MANUAL',
      },
    });
  }

  async update(projectId: string, id: string, dto: any) {
    const existing = await this.prisma.contact.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Contact not found');
    const data: any = {};
    for (const k of ['email', 'firstName', 'lastName', 'phone', 'companyId', 'ownerId', 'tags', 'notes', 'status']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    return this.prisma.contact.update({ where: { id }, data });
  }

  async remove(projectId: string, id: string) {
    const existing = await this.prisma.contact.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Contact not found');
    await this.prisma.contact.delete({ where: { id } });
    return { deleted: true as const };
  }
}
