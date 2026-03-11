import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { unlink } from 'fs/promises';
import { resolve } from 'path';

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

  async createFromUpload(
    file: Express.Multer.File,
    projectId: string,
    type: string,
    title: string,
    userId: string,
  ) {
    return this.prisma.document.create({
      data: {
        projectId,
        type: type as any,
        title,
        content: {},
        fileUrl: `/api/uploads/${file.filename}`,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        generatedByAi: false,
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
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');

    // Delete physical file if it's an uploaded document
    if (doc.fileUrl) {
      const filename = doc.fileUrl.split('/').pop();
      if (filename) {
        const filePath = resolve(process.cwd(), '../../uploads', filename);
        await unlink(filePath).catch(() => {});
      }
    }

    return this.prisma.document.delete({ where: { id } });
  }
}
