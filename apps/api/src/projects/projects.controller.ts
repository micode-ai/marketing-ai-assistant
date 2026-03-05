import { Controller, Get, Post, Put, Delete, Body, Param, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ProjectsService } from './projects.service';
import { ProjectExportService } from './project-export.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(
    private projectsService: ProjectsService,
    private projectExportService: ProjectExportService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all projects for organization' })
  findAll(@Query('organizationId') organizationId: string) {
    return this.projectsService.findAll(organizationId);
  }

  @Post('import/validate')
  @ApiOperation({ summary: 'Validate project import data' })
  validateImport(@Body('data') data: any) {
    return this.projectExportService.validateImport(data);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import project from exported JSON' })
  importProject(
    @Body('organizationId') organizationId: string,
    @Body('data') data: any,
    @Body('sections') sections: string[],
    @CurrentUser() user: any,
  ) {
    return this.projectExportService.importProject(organizationId, user.id, data, sections as any);
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export project as JSON' })
  async exportProject(
    @Param('id') id: string,
    @Query('sections') sections: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const data = await this.projectExportService.exportProject(id, user.id, sections);
    const filename = `${data.project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-export.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
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
