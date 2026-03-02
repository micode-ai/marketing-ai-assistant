import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('content')
@ApiBearerAuth()
@Controller('content')
export class ContentController {
  constructor(private contentService: ContentService) {}

  @Get()
  @ApiOperation({ summary: 'Get all content for project' })
  findAll(
    @Query('projectId') projectId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('platform') platform?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.contentService.findAll(projectId, { type, status, platform, from, to });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contentService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateContentDto, @CurrentUser() user: any) {
    return this.contentService.create(dto, user.id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContentDto, @CurrentUser() user: any) {
    return this.contentService.update(id, dto, user.id);
  }

  @Put(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.contentService.updateStatus(id, status);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.contentService.delete(id);
  }
}
