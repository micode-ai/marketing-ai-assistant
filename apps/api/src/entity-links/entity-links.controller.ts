import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EntityLinksService } from './entity-links.service';
import { PromoteEntityDto } from './dto/promote-entity.dto';
import { DemoteEntityDto } from './dto/demote-entity.dto';
import { OrgRoleGuard } from '../common/guards/org-role.guard';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('entity-links')
@ApiBearerAuth()
@UseGuards(OrgRoleGuard)
@Controller('entity-links')
export class EntityLinksController {
  constructor(private readonly entityLinksService: EntityLinksService) {}

  @Post('promote')
  @OrgRoles('OWNER', 'ADMIN')
  promote(@Body() dto: PromoteEntityDto, @CurrentUser() user: any) {
    return this.entityLinksService.promote(dto, user.id);
  }

  @Post('demote')
  @OrgRoles('OWNER', 'ADMIN')
  demote(@Body() dto: DemoteEntityDto, @CurrentUser() user: any) {
    return this.entityLinksService.demote(dto, user.id);
  }

  @Get()
  @ApiQuery({ name: 'entityType', required: true })
  @ApiQuery({ name: 'entityId', required: true })
  findLinks(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.entityLinksService.findLinks(entityType, entityId);
  }

  @Delete(':id')
  @OrgRoles('OWNER', 'ADMIN')
  deleteLink(@Param('id') id: string) {
    return this.entityLinksService.deleteLink(id);
  }
}
