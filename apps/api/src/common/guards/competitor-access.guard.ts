import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CompetitorAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const competitorId = request.params?.id;

    if (!competitorId) throw new BadRequestException('competitorId is required');
    if (!user) throw new ForbiddenException('Not authenticated');

    const competitor = await this.prisma.competitor.findUnique({
      where: { id: competitorId },
      select: {
        projectId: true,
        organizationId: true,
        project: { select: { organizationId: true } },
      },
    });
    if (!competitor) throw new NotFoundException('Competitor not found');

    let organizationId: string;

    if (competitor.projectId !== null) {
      if (!competitor.project) throw new NotFoundException('Project not found');
      organizationId = competitor.project.organizationId;
    } else if (competitor.organizationId !== null) {
      organizationId = competitor.organizationId;
    } else {
      throw new BadRequestException('Competitor has no scope');
    }

    // TODO: type RequestUser with membership shape
    const membership = user.memberships?.find(
      (m: any) => m.organizationId === organizationId,
    );
    if (!membership) throw new ForbiddenException('No access to this competitor');

    return true;
  }
}
