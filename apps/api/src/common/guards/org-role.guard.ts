import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { ORG_ROLES_KEY } from '../decorators/org-roles.decorator';

@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    const organizationId = request.query?.organizationId || request.body?.organizationId;

    if (!userId || !organizationId) {
      throw new ForbiddenException('Organization context required');
    }

    const member = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId },
    });

    if (!member) {
      throw new ForbiddenException('Not a member of this organization');
    }

    if (!requiredRoles.includes(member.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }

    return true;
  }
}
