import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        memberships: { where: { joinedAt: { not: null } }, include: { organization: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // Auto-cleanup: if user has multiple active memberships, remove empty owned orgs
    if (user.memberships.length > 1) {
      await this.removeEmptyOwnedOrgs(id);
      // Re-fetch after cleanup
      const refreshed = await this.prisma.user.findUnique({
        where: { id },
        include: {
          memberships: { where: { joinedAt: { not: null } }, include: { organization: true } },
        },
      });
      if (!refreshed) throw new NotFoundException('User not found');
      const { passwordHash: _pw, ...rest } = refreshed;
      return rest;
    }

    const { passwordHash: _passwordHash, ...rest } = user;
    return rest;
  }

  async update(id: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
    });
  }

  private async removeEmptyOwnedOrgs(userId: string) {
    const ownedMemberships = await this.prisma.organizationMember.findMany({
      where: { userId, role: 'OWNER', joinedAt: { not: null } },
      select: { organizationId: true },
    });

    for (const { organizationId } of ownedMemberships) {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        include: {
          _count: {
            select: {
              members: true,
              projects: true,
              emailAccounts: true,
              socialAccounts: true,
              webhooks: true,
            },
          },
        },
      });

      if (!org) continue;
      const c = org._count;
      if (c.members <= 1 && c.projects === 0 && c.emailAccounts === 0
          && c.socialAccounts === 0 && c.webhooks === 0) {
        this.logger.log(`Auto-removing empty org "${org.name}" (${org.id}) for user ${userId}`);
        await this.prisma.organization.delete({ where: { id: organizationId } });
      }
    }
  }
}
