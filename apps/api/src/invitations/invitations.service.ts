import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(private prisma: PrismaService) {}

  async getPending(userId: string) {
    return this.prisma.organizationMember.findMany({
      where: { userId, joinedAt: null },
      include: {
        organization: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
      orderBy: { invitedAt: 'desc' },
    });
  }

  async accept(invitationId: string, userId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { id: invitationId },
    });
    if (!member) throw new NotFoundException('Invitation not found');
    if (member.userId !== userId) throw new ForbiddenException('Not your invitation');
    if (member.joinedAt) throw new ForbiddenException('Already accepted');

    const result = await this.prisma.organizationMember.update({
      where: { id: invitationId },
      data: { joinedAt: new Date() },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    // Clean up empty personal orgs the user owns
    await this.removeEmptyOwnedOrgs(userId, member.organizationId);

    return result;
  }

  /**
   * After accepting an invite, remove any orgs where the user is the sole
   * OWNER and no real data exists (no projects, email accounts, etc.).
   * This prevents the "ghost" org created during registration from lingering.
   */
  private async removeEmptyOwnedOrgs(userId: string, excludeOrgId: string) {
    const ownedMemberships = await this.prisma.organizationMember.findMany({
      where: { userId, role: 'OWNER', organizationId: { not: excludeOrgId } },
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
      const isEmpty = c.members <= 1 && c.projects === 0 && c.emailAccounts === 0
        && c.socialAccounts === 0 && c.webhooks === 0;

      if (isEmpty) {
        this.logger.log(`Removing empty org "${org.name}" (${org.id}) after user ${userId} joined another org`);
        await this.prisma.organization.delete({ where: { id: organizationId } });
      }
    }
  }

  async decline(invitationId: string, userId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { id: invitationId },
    });
    if (!member) throw new NotFoundException('Invitation not found');
    if (member.userId !== userId) throw new ForbiddenException('Not your invitation');
    if (member.joinedAt) throw new ForbiddenException('Already accepted');

    await this.prisma.organizationMember.delete({
      where: { id: invitationId },
    });

    return { success: true };
  }
}
