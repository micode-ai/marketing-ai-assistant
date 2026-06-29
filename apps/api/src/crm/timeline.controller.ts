import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { TimelineService } from './timeline.service';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/timeline')
@UseGuards(ProjectAccessGuard)
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get()
  get(
    @Query('projectId') projectId: string,
    @Query('contactId') contactId?: string,
    @Query('dealId') dealId?: string,
  ) {
    return this.timeline.timeline(projectId, { contactId, dealId });
  }
}
