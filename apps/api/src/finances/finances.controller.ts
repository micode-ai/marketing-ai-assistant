import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FinancesService } from './finances.service';
import { CreateFinanceRecordDto } from './dto/create-finance-record.dto';
import { UpdateFinanceRecordDto } from './dto/update-finance-record.dto';
import { CreateFinanceCategoryDto } from './dto/create-finance-category.dto';
import { UpdateFinanceCategoryDto } from './dto/update-finance-category.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('finances')
@ApiBearerAuth()
@Controller('finances')
export class FinancesController {
  constructor(private financesService: FinancesService) {}

  private getOrgId(user: any): string {
    return user.memberships?.[0]?.organizationId;
  }

  private buildScope(user: any, projectId?: string, organizationId?: string, aggregated?: string) {
    const orgId = this.getOrgId(user);
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    return {
      projectId: projectId || undefined,
      organizationId: organizationId || orgId,
      aggregated: aggregated === 'true',
    };
  }

  // ── Category routes BEFORE :id routes ────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'Get finance categories (project-scoped, org-scoped, or aggregated)' })
  findCategories(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
    @CurrentUser() user?: any,
  ) {
    return this.financesService.findCategories(this.buildScope(user, projectId, organizationId, aggregated));
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a finance category' })
  createCategory(@Body() dto: CreateFinanceCategoryDto, @CurrentUser() user: any) {
    return this.financesService.createCategory(dto, this.getOrgId(user));
  }

  @Put('categories/:id')
  @ApiOperation({ summary: 'Update a finance category' })
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateFinanceCategoryDto,
    @CurrentUser() user: any,
  ) {
    return this.financesService.updateCategory(id, dto, this.getOrgId(user));
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete a finance category' })
  deleteCategory(@Param('id') id: string, @CurrentUser() user: any) {
    return this.financesService.deleteCategory(id, this.getOrgId(user));
  }

  // ── Summary & Exchange Rate ──────────────────────────────────────────

  @Get('summary')
  @ApiOperation({ summary: 'Get financial summary (project-scoped, org-scoped, or aggregated)' })
  getSummary(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @CurrentUser() user?: any,
  ) {
    return this.financesService.getSummary(
      this.buildScope(user, projectId, organizationId, aggregated),
      dateFrom,
      dateTo,
    );
  }

  @Get('exchange-rate')
  @ApiOperation({ summary: 'Get exchange rate between two currencies' })
  async getExchangeRate(@Query('from') from: string, @Query('to') to: string) {
    if (!from || !to) throw new BadRequestException('from and to are required');
    return this.financesService.getExchangeRate(from, to);
  }

  // ── Record routes ────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get finance records (project-scoped, org-scoped, or aggregated)' })
  findRecords(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
    @Query('type') type?: 'INCOME' | 'EXPENSE',
    @Query('categoryId') categoryId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: any,
  ) {
    return this.financesService.findRecords(
      this.buildScope(user, projectId, organizationId, aggregated),
      {
        type,
        categoryId,
        dateFrom,
        dateTo,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a finance record' })
  createRecord(@Body() dto: CreateFinanceRecordDto, @CurrentUser() user: any) {
    return this.financesService.createRecord(dto, this.getOrgId(user));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a finance record' })
  updateRecord(
    @Param('id') id: string,
    @Body() dto: UpdateFinanceRecordDto,
    @CurrentUser() user: any,
  ) {
    return this.financesService.updateRecord(id, dto, this.getOrgId(user));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a finance record' })
  deleteRecord(@Param('id') id: string, @CurrentUser() user: any) {
    return this.financesService.deleteRecord(id, this.getOrgId(user));
  }
}
