import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { DealsService } from './deals.service';
import { DealInsightsService } from './deal-insights.service';
import { CreateDealDto, LoseDealDto, UpdateDealDto } from './dto/deal.dto';
import { GenerateInsightsDto } from './dto/deal-insights.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/deals')
@UseGuards(ProjectAccessGuard)
export class DealsController {
  constructor(
    private readonly deals: DealsService,
    private readonly dealInsights: DealInsightsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List deals (filterable)' })
  list(
    @Query('projectId') projectId: string,
    @Query('status') status?: string,
    @Query('stageId') stageId?: string,
    @Query('ownerId') ownerId?: string,
    @Query('search') search?: string,
  ) {
    return this.deals.list(projectId, { status, stageId, ownerId, search });
  }

  @Get('forecast')
  forecast(@Query('projectId') projectId: string) {
    return this.deals.forecast(projectId);
  }

  @Post(':id/insights')
  generateInsights(
    @Query('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: GenerateInsightsDto,
  ) {
    return this.dealInsights.generate(projectId, id, dto.language || 'en');
  }

  @Get(':id/insights')
  getInsights(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.dealInsights.get(projectId, id);
  }

  @Get(':id')
  get(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.deals.get(projectId, id);
  }

  @Post()
  create(@Query('projectId') projectId: string, @Body() dto: CreateDealDto) {
    return this.deals.create(projectId, dto);
  }

  @Patch(':id')
  update(@Query('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateDealDto) {
    return this.deals.update(projectId, id, dto);
  }

  @Post(':id/win')
  win(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.deals.win(projectId, id);
  }

  @Post(':id/lose')
  lose(@Query('projectId') projectId: string, @Param('id') id: string, @Body() dto: LoseDealDto) {
    return this.deals.lose(projectId, id, dto);
  }

  @Post(':id/reopen')
  reopen(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.deals.reopen(projectId, id);
  }

  @Delete(':id')
  remove(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.deals.remove(projectId, id);
  }
}
