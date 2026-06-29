import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { PipelineService } from './pipeline.service';
import { CreateStageDto, UpdateStageDto } from './dto/pipeline.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/pipeline/stages')
@UseGuards(ProjectAccessGuard)
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Get()
  @ApiOperation({ summary: 'List pipeline stages (seeds defaults on first call)' })
  list(@Query('projectId') projectId: string) {
    return this.pipeline.listStages(projectId);
  }

  @Post()
  create(@Query('projectId') projectId: string, @Body() dto: CreateStageDto) {
    return this.pipeline.createStage(projectId, dto);
  }

  @Patch(':id')
  update(@Query('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.pipeline.updateStage(projectId, id, dto);
  }

  @Delete(':id')
  remove(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.pipeline.deleteStage(projectId, id);
  }
}
