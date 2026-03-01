import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';

@Injectable()
export class ChecklistsService {
  constructor(private prisma: PrismaService) {}

  async findAll(projectId: string) {
    return this.prisma.checklist.findMany({
      where: { projectId },
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
    return this.prisma.checklist.create({
      data: {
        projectId: dto.projectId,
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
    return this.prisma.checklistItem.update({
      where: { id: itemId },
      data,
    });
  }

  async delete(id: string) {
    return this.prisma.checklist.delete({ where: { id } });
  }

  async addItem(checklistId: string, item: any) {
    const count = await this.prisma.checklistItem.count({ where: { checklistId } });
    return this.prisma.checklistItem.create({
      data: { checklistId, ...item, order: item.order || count + 1, priority: (item.priority || 'MEDIUM') as any },
    });
  }
}
