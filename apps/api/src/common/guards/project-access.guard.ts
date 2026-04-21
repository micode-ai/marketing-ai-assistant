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
export class ProjectAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const projectId =
      request.params?.projectId ??
      request.query.projectId ??
      request.body?.projectId;

    if (!projectId) throw new BadRequestException('projectId is required');
    if (!user) throw new ForbiddenException('Not authenticated');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    // TODO: type RequestUser with membership shape
    const membership = user.memberships?.find(
      (m: any) => m.organizationId === project.organizationId,
    );
    if (!membership) throw new ForbiddenException('No access to this project');

    return true;
  }
}
