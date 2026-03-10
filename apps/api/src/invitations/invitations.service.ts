import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class InvitationsService {
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

    return this.prisma.organizationMember.update({
      where: { id: invitationId },
      data: { joinedAt: new Date() },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
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
