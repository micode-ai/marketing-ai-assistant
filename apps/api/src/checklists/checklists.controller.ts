import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ChecklistsService } from './checklists.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('checklists')
@ApiBearerAuth()
@Controller('checklists')
export class ChecklistsController {
  constructor(private checklistsService: ChecklistsService) {}

  @Get()
  findAll(@Query('projectId') projectId: string) {
    return this.checklistsService.findAll(projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.checklistsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateChecklistDto) {
    return this.checklistsService.create(dto);
  }

  @Post(':id/items')
  addItem(@Param('id') checklistId: string, @Body() item: any) {
    return this.checklistsService.addItem(checklistId, item);
  }

  @Put('items/:itemId')
  updateItem(@Param('itemId') itemId: string, @Body() dto: UpdateChecklistItemDto, @CurrentUser() user: any) {
    return this.checklistsService.updateItem(itemId, dto, user.id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.checklistsService.delete(id);
  }
}
