import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { readFile, unlink } from 'fs/promises';
import { extname, resolve } from 'path';

function isMarkdownFile(mimetype: string | undefined, originalname: string): boolean {
  if (mimetype === 'text/markdown' || mimetype === 'text/x-markdown') return true;
  const ext = extname(originalname || '').toLowerCase();
  return ext === '.md' || ext === '.markdown';
}

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  // --- Document Type CRUD ---

  async getDocumentTypes(organizationId: string) {
    return this.prisma.documentTypeConfig.findMany({
      where: { organizationId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createDocumentType(organizationId: string, label: string) {
    const slug = label.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    if (!slug) throw new BadRequestException('Invalid label');

    const existing = await this.prisma.documentTypeConfig.findUnique({
      where: { organizationId_slug: { organizationId, slug } },
    });
    if (existing) throw new BadRequestException('Document type already exists');

    const maxOrder = await this.prisma.documentTypeConfig.findFirst({
      where: { organizationId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    return this.prisma.documentTypeConfig.create({
      data: {
        organizationId,
        slug,
        label: label.trim(),
        isDefault: false,
        sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      },
    });
  }

  async deleteDocumentType(id: string, organizationId: string) {
    const typeConfig = await this.prisma.documentTypeConfig.findFirst({
      where: { id, organizationId },
    });
    if (!typeConfig) throw new NotFoundException('Document type not found');

    // Check if any documents use this type
    const orgProjects = await this.prisma.project.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const projectIds = orgProjects.map(p => p.id);

    const docsCount = await this.prisma.document.count({
      where: { projectId: { in: projectIds }, type: typeConfig.slug },
    });
    if (docsCount > 0) {
      throw new BadRequestException(`Cannot delete: ${docsCount} document(s) use this type`);
    }

    return this.prisma.documentTypeConfig.delete({ where: { id } });
  }

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

    return this.prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async create(dto: any, userId: string) {
    let organizationId = dto.organizationId;
    if (!organizationId && dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        select: { organizationId: true },
      });
      organizationId = project?.organizationId;
    }

    return this.prisma.document.create({
      data: {
        projectId: dto.projectId,
        organizationId,
        scope: dto.scope || 'PROJECT',
        type: dto.type ? (dto.type as any) : null,
        title: dto.title,
        content: dto.content || {},
        contentMd: dto.contentMd,
        generatedByAi: dto.generatedByAi || false,
        createdBy: userId,
      },
    });
  }

  async createFromUpload(
    // eslint-disable-next-line no-undef
    file: Express.Multer.File,
    projectId: string,
    type: string | undefined,
    title: string,
    userId: string,
  ) {
    let organizationId: string | undefined;
    if (projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { organizationId: true },
      });
      organizationId = project?.organizationId;
    }

    let contentMd: string | undefined;
    if (isMarkdownFile(file.mimetype, file.originalname)) {
      try {
        contentMd = await readFile(file.path, 'utf8');
      } catch {
        // If reading fails we still persist the upload with file metadata only.
      }
    }

    return this.prisma.document.create({
      data: {
        projectId,
        organizationId,
        scope: 'PROJECT',
        type: type ? (type as any) : null,
        title,
        content: {},
        contentMd,
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
    const data: any = { version: { increment: 1 } };
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.contentMd !== undefined) data.contentMd = dto.contentMd;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.type !== undefined) data.type = dto.type === '' || dto.type === null ? null : dto.type;
    return this.prisma.document.update({
      where: { id },
      data,
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
