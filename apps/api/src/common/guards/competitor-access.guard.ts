import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CompetitorAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const competitorId = request.params?.id;

    if (!competitorId) throw new BadRequestException('Competitor id is required');
    if (!user) throw new ForbiddenException('Not authenticated');

    const competitor = await this.prisma.competitor.findUnique({
      where: { id: competitorId },
      select: { projectId: true, organizationId: true },
    });
    if (!competitor) throw new BadRequestException('Competitor not found');

    let organizationId: string;

    if (competitor.projectId !== null) {
      const project = await this.prisma.project.findUnique({
        where: { id: competitor.projectId },
        select: { organizationId: true },
      });
      if (!project) throw new BadRequestException('Project not found');
      organizationId = project.organizationId;
    } else if (competitor.organizationId !== null) {
      organizationId = competitor.organizationId;
    } else {
      throw new BadRequestException('Competitor has no scope');
    }

    const membership = user.memberships?.find(
      (m: any) => m.organizationId === organizationId,
    );
    if (!membership) throw new ForbiddenException('No access to this competitor');

    return true;
  }
}
