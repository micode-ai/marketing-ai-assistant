import { Controller, Get, Put, Post, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private orgsService: OrganizationsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by ID' })
  findOne(@Param('id') id: string) {
    return this.orgsService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update organization' })
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdateOrganizationDto) {
    return this.orgsService.update(id, user.id, dto);
  }

  @Post(':id/members/invite')
  @ApiOperation({ summary: 'Invite member to organization' })
  inviteMember(@Param('id') orgId: string, @CurrentUser() user: any, @Body() dto: InviteMemberDto) {
    return this.orgsService.inviteMember(orgId, user.id, dto);
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove member from organization' })
  removeMember(@Param('id') orgId: string, @Param('memberId') memberId: string, @CurrentUser() user: any) {
    return this.orgsService.removeMember(orgId, user.id, memberId);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Leave organization' })
  leave(@Param('id') orgId: string, @CurrentUser() user: any) {
    return this.orgsService.leaveOrganization(orgId, user.id);
  }
}
