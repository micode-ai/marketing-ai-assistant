import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.organizationMember.create({
      data: { userId: user.id, organizationId: orgId, role: dto.role as any, invitedAt: new Date() },
    });
  }

  async removeMember(orgId: string, removerId: string, memberId: string) {
    await this.checkOwnerOrAdmin(orgId, removerId);
    return this.prisma.organizationMember.delete({
      where: { userId_organizationId: { userId: memberId, organizationId: orgId } },
    });
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
