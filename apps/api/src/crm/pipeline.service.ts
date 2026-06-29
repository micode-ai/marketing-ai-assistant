import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const DEFAULT_STAGES = [
  { name: 'Lead', probability: 10 },
  { name: 'Qualified', probability: 25 },
  { name: 'Proposal', probability: 50 },
  { name: 'Negotiation', probability: 75 },
];

@Injectable()
export class PipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async listStages(projectId: string) {
    const count = await this.prisma.pipelineStage.count({ where: { projectId } });
    if (count === 0) {
      await this.prisma.pipelineStage.createMany({
        data: DEFAULT_STAGES.map((s, i) => ({
          projectId,
          name: s.name,
          order: i,
          probability: s.probability,
        })),
        skipDuplicates: true,
      });
    }
    return this.prisma.pipelineStage.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  }

  async firstStageId(projectId: string): Promise<string | null> {
    const stages = await this.listStages(projectId);
    return stages[0]?.id ?? null;
  }

  async createStage(projectId: string, dto: { name: string; probability?: number }) {
    const last = await this.prisma.pipelineStage.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const order = last ? last.order + 1 : 0;
    return this.prisma.pipelineStage.create({
      data: {
        projectId,
        name: dto.name,
        order,
        probability: this.clampProbability(dto.probability ?? 0),
      },
    });
  }

  async updateStage(
    projectId: string,
    id: string,
    dto: { name?: string; probability?: number; order?: number },
  ) {
    const existing = await this.prisma.pipelineStage.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Stage not found');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.probability !== undefined) data.probability = this.clampProbability(dto.probability);
    if (dto.order !== undefined) data.order = dto.order;
    return this.prisma.pipelineStage.update({ where: { id }, data });
  }

  async deleteStage(projectId: string, id: string): Promise<{ deleted: true }> {
    const target = await this.prisma.pipelineStage.findFirst({ where: { id, projectId } });
    if (!target) throw new NotFoundException('Stage not found');
    const stages = await this.prisma.pipelineStage.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      select: { id: true, order: true },
    });
    if (stages.length <= 1) {
      throw new BadRequestException('Cannot delete the last remaining stage');
    }
    const remaining = stages.filter((s) => s.id !== id);
    const prev =
      [...remaining].reverse().find((s) => s.order < target.order) ?? remaining[0];
    await this.prisma.$transaction([
      this.prisma.deal.updateMany({ where: { stageId: id }, data: { stageId: prev.id } }),
      this.prisma.pipelineStage.delete({ where: { id } }),
    ]);
    return { deleted: true };
  }

  private clampProbability(p: number): number {
    return Math.max(0, Math.min(100, Math.round(p)));
  }
}
