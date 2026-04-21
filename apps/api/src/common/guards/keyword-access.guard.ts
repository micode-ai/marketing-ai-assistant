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
export class KeywordAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const keywordId = request.params?.id;

    if (!keywordId) throw new BadRequestException('keywordId is required');
    if (!user) throw new ForbiddenException('Not authenticated');

    const keyword = await this.prisma.keyword.findUnique({
      where: { id: keywordId },
      select: {
        projectId: true,
        project: { select: { organizationId: true } },
      },
    });
    if (!keyword) throw new NotFoundException('Keyword not found');

    if (keyword.projectId === null || keyword.project === null) {
      throw new ForbiddenException(
        'Org-scoped keywords are not supported for this operation',
      );
    }

    // TODO: type RequestUser with membership shape
    const membership = user.memberships?.find(
      (m: any) => m.organizationId === keyword.project!.organizationId,
    );
    if (!membership) throw new ForbiddenException('No access to this project');

    return true;
  }
}
