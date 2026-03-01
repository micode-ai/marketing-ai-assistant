import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all projects for organization' })
  findAll(@Query('organizationId') organizationId: string) {
    return this.projectsService.findAll(organizationId);
  }

  @Get(':id/tracking')
  @ApiOperation({ summary: 'Get project tracking info' })
  getTrackingInfo(@Param('id') id: string, @CurrentUser() user: any) {
    return this.projectsService.getTrackingInfo(id, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.projectsService.findOne(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create project' })
  create(@Query('organizationId') organizationId: string, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(organizationId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update project' })
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive project' })
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.projectsService.delete(id, user.id);
  }
}
