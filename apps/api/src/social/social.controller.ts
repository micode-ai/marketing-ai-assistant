import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SocialService } from './social.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('social')
@ApiBearerAuth()
@Controller('social')
export class SocialController {
  constructor(private socialService: SocialService) {}

  @Get('accounts')
  @ApiOperation({ summary: 'List connected social accounts for an organization' })
  getAccounts(@CurrentUser() user: any) {
    const organizationId: string = user.memberships?.[0]?.organizationId;
    return this.socialService.findAccounts(organizationId);
  }

  @Post('accounts')
  @ApiOperation({ summary: 'Connect a social account by providing credentials manually' })
  connectAccount(@CurrentUser() user: any, @Body() dto: any) {
    const organizationId: string = user.memberships?.[0]?.organizationId;
    return this.socialService.connectAccount(organizationId, dto);
  }

  @Put('accounts/:id')
  @ApiOperation({ summary: 'Update credentials of a connected social account' })
  updateAccount(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: any) {
    const organizationId: string = user.memberships?.[0]?.organizationId;
    return this.socialService.updateAccount(id, organizationId, dto);
  }

  @Post('accounts/:id/refresh-telegram')
  @ApiOperation({ summary: 'Refresh Telegram channel title and avatar via getChat' })
  refreshTelegram(@Param('id') id: string, @CurrentUser() user: any) {
    const organizationId: string = user.memberships?.[0]?.organizationId;
    return this.socialService.refreshTelegramProfile(id, organizationId);
  }

  @Delete('accounts/:id')
  @ApiOperation({ summary: 'Disconnect a social account' })
  disconnectAccount(@Param('id') id: string, @CurrentUser() user: any) {
    const organizationId: string = user.memberships?.[0]?.organizationId;
    return this.socialService.disconnectAccount(id, organizationId);
  }

  @Post('publish')
  @ApiOperation({ summary: 'Publish content to selected social accounts' })
  async publish(
    @Body() dto: { contentId?: string; socialAccountIds?: string[]; publications?: Array<{ socialAccountId: string; contentId: string }> },
    @CurrentUser() user: any,
  ) {
    const organizationId: string = user.memberships?.[0]?.organizationId;
    return this.socialService.publish(dto, organizationId);
  }

  @Get('publications')
  @ApiOperation({ summary: 'Get publication history for a content item' })
  getPublications(@Query('contentId') contentId: string) {
    return this.socialService.getPublications(contentId);
  }

  @Get('project-accounts')
  @ApiOperation({ summary: 'Get social accounts enabled for a specific project' })
  getProjectAccounts(@Query('projectId') projectId: string, @CurrentUser() user: any) {
    const organizationId: string = user.memberships?.[0]?.organizationId;
    return this.socialService.getProjectAccounts(projectId, organizationId);
  }

  @Put('project-accounts')
  @ApiOperation({ summary: 'Set social accounts enabled for a specific project' })
  setProjectAccounts(
    @CurrentUser() user: any,
    @Body() dto: { projectId: string; socialAccountIds: string[] },
  ) {
    const organizationId: string = user.memberships?.[0]?.organizationId;
    return this.socialService.setProjectAccounts(dto.projectId, dto.socialAccountIds, organizationId);
  }
}
