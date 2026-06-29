import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto, UpdateActivityDto } from './dto/activity.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/activities')
@UseGuards(ProjectAccessGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(
    @Query('projectId') projectId: string,
    @Query('contactId') contactId?: string,
    @Query('dealId') dealId?: string,
    @Query('companyId') companyId?: string,
    @Query('type') type?: string,
  ) {
    return this.activities.list(projectId, { contactId, dealId, companyId, type });
  }

  @Post()
  create(@Query('projectId') projectId: string, @Body() dto: CreateActivityDto) {
    return this.activities.create(projectId, dto);
  }

  @Patch(':id')
  update(@Query('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateActivityDto) {
    return this.activities.update(projectId, id, dto);
  }

  @Delete(':id')
  remove(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.activities.remove(projectId, id);
  }
}
