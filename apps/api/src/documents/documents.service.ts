import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(projectId: string) {
    return this.prisma.document.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async create(dto: any, userId: string) {
    return this.prisma.document.create({
      data: {
        projectId: dto.projectId,
        type: dto.type as any,
        title: dto.title,
        content: dto.content || {},
        contentMd: dto.contentMd,
        generatedByAi: dto.generatedByAi || false,
        createdBy: userId,
      },
    });
  }

  async update(id: string, dto: any) {
    return this.prisma.document.update({
      where: { id },
      data: { ...dto, version: { increment: 1 } },
    });
  }

  async delete(id: string) {
    return this.prisma.document.delete({ where: { id } });
  }
}
