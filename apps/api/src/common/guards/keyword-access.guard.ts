import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class KeywordAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const keywordId = request.params?.id;

    if (!keywordId) throw new BadRequestException('Keyword id is required');
    if (!user) throw new ForbiddenException('Not authenticated');

    const keyword = await this.prisma.keyword.findUnique({
      where: { id: keywordId },
      select: { projectId: true },
    });
    if (!keyword) throw new BadRequestException('Keyword not found');

    if (keyword.projectId === null) {
      throw new ForbiddenException(
        'Org-scoped keywords are not supported for this operation',
      );
    }

    const project = await this.prisma.project.findUnique({
      where: { id: keyword.projectId },
      select: { organizationId: true },
    });
    if (!project) throw new BadRequestException('Project not found');

    const membership = user.memberships?.find(
      (m: any) => m.organizationId === project.organizationId,
    );
    if (!membership) throw new ForbiddenException('No access to this project');

    return true;
  }
}
