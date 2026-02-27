import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.project.findMany({
      where: { organizationId, status: { not: 'ARCHIVED' } },
      include: {
        _count: { select: { campaigns: true, content: true, checklists: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        _count: { select: { campaigns: true, content: true, checklists: true, emailLists: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    await this.checkAccess(project.organizationId, userId);
    return project;
  }

  async create(organizationId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: { ...dto, organizationId } as any,
    });
  }

  async update(id: string, userId: string, dto: UpdateProjectDto) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    await this.checkAccess(project.organizationId, userId);
    return this.prisma.project.update({ where: { id }, data: dto as any });
  }

  async delete(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    await this.checkAccess(project.organizationId, userId);
    return this.prisma.project.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  private async checkAccess(organizationId: string, userId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!member) throw new ForbiddenException('Access denied');
  }
}
