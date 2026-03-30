import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { ReorderChecklistItemsDto } from './dto/reorder-checklist-items.dto';

@Injectable()
export class ChecklistsService {
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

    return this.prisma.checklist.findMany({
      where,
      include: {
        items: { orderBy: { order: 'asc' } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const checklist = await this.prisma.checklist.findUnique({
      where: { id },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!checklist) throw new NotFoundException('Checklist not found');
    const total = checklist.items.length;
    const completed = checklist.items.filter(i => i.isCompleted).length;
    return { ...checklist, progress: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }

  async create(dto: CreateChecklistDto) {
    let organizationId = (dto as any).organizationId;
    if (!organizationId && dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        select: { organizationId: true },
      });
      organizationId = project?.organizationId;
    }

    return this.prisma.checklist.create({
      data: {
        projectId: dto.projectId,
        organizationId,
        scope: (dto as any).scope || 'PROJECT',
        name: dto.name,
        type: dto.type as any,
        description: dto.description,
        isTemplate: dto.isTemplate || false,
        items: dto.items ? { create: dto.items.map(item => ({ ...item, priority: (item.priority || 'MEDIUM') as any })) } : undefined,
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async updateItem(itemId: string, dto: UpdateChecklistItemDto, userId: string) {
    const data: Record<string, any> = { ...dto };
    if (dto.priority !== undefined) data.priority = dto.priority as any;
    if (dto.isCompleted !== undefined) {
      data.completedAt = dto.isCompleted ? new Date() : null;
      data.completedBy = dto.isCompleted ? userId : null;
    }
    if (dto.note !== undefined) {
      data.noteUpdatedBy = userId;
      data.noteUpdatedAt = new Date();
    }
    return this.prisma.checklistItem.update({
      where: { id: itemId },
      data,
    });
  }

  async update(id: string, dto: UpdateChecklistDto) {
    const checklist = await this.prisma.checklist.findUnique({ where: { id } });
    if (!checklist) throw new NotFoundException('Checklist not found');
    return this.prisma.checklist.update({
      where: { id },
      data: dto,
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async delete(id: string) {
    const checklist = await this.prisma.checklist.findUnique({ where: { id } });
    if (!checklist) throw new NotFoundException('Checklist not found');
    return this.prisma.checklist.delete({ where: { id } });
  }

  async addItem(checklistId: string, dto: CreateChecklistItemDto) {
    const count = await this.prisma.checklistItem.count({ where: { checklistId } });
    return this.prisma.checklistItem.create({
      data: {
        checklistId,
        title: dto.title,
        description: dto.description,
        order: dto.order || count + 1,
        priority: (dto.priority || 'MEDIUM') as any,
        isCompleted: dto.isCompleted || false,
        section: dto.section || null,
      },
    });
  }

  async deleteItem(itemId: string) {
    return this.prisma.checklistItem.delete({ where: { id: itemId } });
  }

  async reorderItems(checklistId: string, dto: ReorderChecklistItemsDto) {
    const updates = dto.itemIds.map((id, index) =>
      this.prisma.checklistItem.update({
        where: { id },
        data: { order: index + 1 },
      }),
    );
    await this.prisma.$transaction(updates);
    return this.findOne(checklistId);
  }
}
