import { Controller, Get, Post, Put, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChecklistsService } from './checklists.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { ReorderChecklistItemsDto } from './dto/reorder-checklist-items.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('checklists')
@ApiBearerAuth()
@Controller('checklists')
export class ChecklistsController {
  constructor(private checklistsService: ChecklistsService) {}

  @Get()
  @ApiOperation({ summary: 'Get checklists (project-scoped, org-scoped, or aggregated)' })
  findAll(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
  ) {
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    return this.checklistsService.findAll({ projectId, organizationId, aggregated: aggregated === 'true' });
  }

  @Post()
  create(@Body() dto: CreateChecklistDto) {
    return this.checklistsService.create(dto);
  }

  // Routes with 'items/' prefix BEFORE ':id' routes to avoid conflicts
  @Put('items/:itemId')
  updateItem(@Param('itemId') itemId: string, @Body() dto: UpdateChecklistItemDto, @CurrentUser() user: any) {
    return this.checklistsService.updateItem(itemId, dto, user.id);
  }

  @Delete('items/:itemId')
  deleteItem(@Param('itemId') itemId: string) {
    return this.checklistsService.deleteItem(itemId);
  }

  // ':id' routes
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.checklistsService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateChecklistDto) {
    return this.checklistsService.update(id, dto);
  }

  @Post(':id/items')
  addItem(@Param('id') checklistId: string, @Body() dto: CreateChecklistItemDto) {
    return this.checklistsService.addItem(checklistId, dto);
  }

  @Put(':id/reorder')
  reorderItems(@Param('id') id: string, @Body() dto: ReorderChecklistItemsDto) {
    return this.checklistsService.reorderItems(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.checklistsService.delete(id);
  }
}
