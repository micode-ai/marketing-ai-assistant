import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

function dayBounds() {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  return { startOfToday, startOfTomorrow };
}

function scopeWhere(scope: string | undefined): any {
  const { startOfToday, startOfTomorrow } = dayBounds();
  if (scope === 'overdue') return { status: 'OPEN', dueDate: { lt: startOfToday } };
  if (scope === 'today') return { status: 'OPEN', dueDate: { gte: startOfToday, lt: startOfTomorrow } };
  if (scope === 'upcoming') return { status: 'OPEN', dueDate: { gte: startOfTomorrow } };
  return {};
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    projectId: string,
    opts: { status?: string; ownerId?: string; scope?: string; contactId?: string; dealId?: string; companyId?: string },
  ) {
    const where: any = { projectId, ...scopeWhere(opts.scope) };
    if (opts.status) where.status = opts.status;
    if (opts.ownerId) where.ownerId = opts.ownerId;
    if (opts.contactId) where.contactId = opts.contactId;
    if (opts.dealId) where.dealId = opts.dealId;
    if (opts.companyId) where.companyId = opts.companyId;
    return this.prisma.task.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        deal: { select: { id: true, title: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async summary(projectId: string, opts: { ownerId?: string }) {
    const base: any = { projectId };
    if (opts.ownerId) base.ownerId = opts.ownerId;
    const [overdue, today, upcoming] = await Promise.all([
      this.prisma.task.count({ where: { ...base, ...scopeWhere('overdue') } }),
      this.prisma.task.count({ where: { ...base, ...scopeWhere('today') } }),
      this.prisma.task.count({ where: { ...base, ...scopeWhere('upcoming') } }),
    ]);
    return { overdue, today, upcoming };
  }

  async get(projectId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, projectId },
      include: { owner: true, contact: true, deal: true, company: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async create(projectId: string, dto: any) {
    return this.prisma.task.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: 'OPEN',
        ownerId: dto.ownerId ?? null,
        contactId: dto.contactId ?? null,
        dealId: dto.dealId ?? null,
        companyId: dto.companyId ?? null,
      },
    });
  }

  async update(projectId: string, id: string, dto: any) {
    const existing = await this.prisma.task.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Task not found');
    const data: any = {};
    for (const k of ['title', 'description', 'ownerId', 'contactId', 'dealId', 'companyId']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    return this.prisma.task.update({ where: { id }, data });
  }

  async complete(projectId: string, id: string) {
    const existing = await this.prisma.task.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Task not found');
    return this.prisma.task.update({ where: { id }, data: { status: 'DONE', completedAt: new Date() } });
  }

  async reopen(projectId: string, id: string) {
    const existing = await this.prisma.task.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Task not found');
    return this.prisma.task.update({ where: { id }, data: { status: 'OPEN', completedAt: null } });
  }

  async remove(projectId: string, id: string) {
    const existing = await this.prisma.task.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Task not found');
    await this.prisma.task.delete({ where: { id } });
    return { deleted: true as const };
  }
}
