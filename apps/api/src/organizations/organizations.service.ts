import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  async findById(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { members: { include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } } }, subscription: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async findBySlug(slug: string) {
    return this.prisma.organization.findUnique({ where: { slug }, include: { subscription: true } });
  }

  async update(id: string, userId: string, dto: UpdateOrganizationDto) {
    await this.checkOwnerOrAdmin(id, userId);
    return this.prisma.organization.update({ where: { id }, data: dto });
  }

  async inviteMember(orgId: string, inviterId: string, dto: InviteMemberDto) {
    await this.checkOwnerOrAdmin(orgId, inviterId);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new NotFoundException('User not found');

    const member = await this.prisma.organizationMember.create({
      data: { userId: user.id, organizationId: orgId, role: dto.role as any, invitedAt: new Date() },
    });

    const [inviter, org] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: inviterId }, select: { name: true, email: true } }),
      this.prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    ]);

    const webUrl = this.config.get('WEB_URL', 'http://localhost:5173');

    try {
      await this.mail.sendTeamInvite({
        to: dto.email,
        inviterName: inviter?.name || inviter?.email || 'A team member',
        organizationName: org?.name || 'the organization',
        role: dto.role,
        loginUrl: `${webUrl}/login`,
      });
    } catch (error) {
      this.logger.warn(`Failed to send invite email to ${dto.email}: ${(error as Error).message}`);
    }

    return member;
  }

  async removeMember(orgId: string, removerId: string, memberId: string) {
    await this.checkOwnerOrAdmin(orgId, removerId);
    return this.prisma.organizationMember.delete({
      where: { userId_organizationId: { userId: memberId, organizationId: orgId } },
    });
  }

  async approveRequest(orgId: string, approverId: string, memberId: string) {
    await this.checkOwnerOrAdmin(orgId, approverId);
    const member = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: memberId, organizationId: orgId } },
    });
    if (!member) throw new NotFoundException('Request not found');
    if (!member.requestedAt || member.joinedAt) throw new ForbiddenException('No pending request');

    return this.prisma.organizationMember.update({
      where: { userId_organizationId: { userId: memberId, organizationId: orgId } },
      data: { joinedAt: new Date() },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  async declineRequest(orgId: string, declinerId: string, memberId: string) {
    await this.checkOwnerOrAdmin(orgId, declinerId);
    const member = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: memberId, organizationId: orgId } },
    });
    if (!member) throw new NotFoundException('Request not found');
    if (!member.requestedAt || member.joinedAt) throw new ForbiddenException('No pending request');

    await this.prisma.organizationMember.delete({
      where: { userId_organizationId: { userId: memberId, organizationId: orgId } },
    });

    return { success: true };
  }

  async leaveOrganization(orgId: string, userId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!member) throw new NotFoundException('Membership not found');
    if (member.role === 'OWNER') throw new ForbiddenException('Owner cannot leave the organization');

    await this.prisma.organizationMember.delete({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });

    return { success: true };
  }

  private async checkOwnerOrAdmin(orgId: string, userId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }
}
