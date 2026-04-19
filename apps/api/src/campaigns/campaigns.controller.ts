import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';

@ApiTags('campaigns')
@ApiBearerAuth()
@Controller('campaigns')
export class CampaignsController {
  constructor(private campaignsService: CampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'Get campaigns (project-scoped, org-scoped, or aggregated)' })
  findAll(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
  ) {
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    return this.campaignsService.findAll({ projectId, organizationId, aggregated: aggregated === 'true' });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.campaignsService.findOne(id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.campaignsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.campaignsService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.campaignsService.delete(id);
  }

  @Patch(':id/attach-content')
  attachContent(@Param('id') id: string, @Body() body: { contentIds: string[] }) {
    return this.campaignsService.attachContent(id, body.contentIds ?? []);
  }

  @Patch(':id/detach-content')
  detachContent(@Param('id') id: string, @Body() body: { contentIds: string[] }) {
    return this.campaignsService.detachContent(id, body.contentIds ?? []);
  }

  @Patch(':id/attach-emails')
  attachEmails(@Param('id') id: string, @Body() body: { emailIds: string[] }) {
    return this.campaignsService.attachEmails(id, body.emailIds ?? []);
  }

  @Patch(':id/detach-emails')
  detachEmails(@Param('id') id: string, @Body() body: { emailIds: string[] }) {
    return this.campaignsService.detachEmails(id, body.emailIds ?? []);
  }

  @Get(':id/available-content')
  availableContent(@Param('id') id: string, @Query('search') search?: string) {
    return this.campaignsService.availableContent(id, search);
  }

  @Get(':id/available-emails')
  availableEmails(@Param('id') id: string, @Query('search') search?: string) {
    return this.campaignsService.availableEmails(id, search);
  }
}
