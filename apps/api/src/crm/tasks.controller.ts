import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/tasks')
@UseGuards(ProjectAccessGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('summary')
  summary(@Query('projectId') projectId: string, @Query('ownerId') ownerId?: string) {
    return this.tasks.summary(projectId, { ownerId });
  }

  @Get()
  list(
    @Query('projectId') projectId: string,
    @Query('status') status?: string,
    @Query('ownerId') ownerId?: string,
    @Query('scope') scope?: string,
    @Query('contactId') contactId?: string,
    @Query('dealId') dealId?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.tasks.list(projectId, { status, ownerId, scope, contactId, dealId, companyId });
  }

  @Get(':id')
  get(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.tasks.get(projectId, id);
  }

  @Post()
  create(@Query('projectId') projectId: string, @Body() dto: CreateTaskDto) {
    return this.tasks.create(projectId, dto);
  }

  @Patch(':id')
  update(@Query('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(projectId, id, dto);
  }

  @Post(':id/complete')
  complete(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.tasks.complete(projectId, id);
  }

  @Post(':id/reopen')
  reopen(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.tasks.reopen(projectId, id);
  }

  @Delete(':id')
  remove(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.tasks.remove(projectId, id);
  }
}
