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

  // ── Category routes BEFORE :id routes ────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'Get finance categories for a project' })
  findCategories(@Query('projectId') projectId: string, @CurrentUser() user: any) {
    if (!projectId) throw new BadRequestException('projectId is required');
    return this.financesService.findCategories(projectId, user.organizationId);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a finance category' })
  createCategory(@Body() dto: CreateFinanceCategoryDto, @CurrentUser() user: any) {
    return this.financesService.createCategory(dto, user.organizationId);
  }

  @Put('categories/:id')
  @ApiOperation({ summary: 'Update a finance category' })
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateFinanceCategoryDto,
    @CurrentUser() user: any,
  ) {
    return this.financesService.updateCategory(id, dto, user.organizationId);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete a finance category' })
  deleteCategory(@Param('id') id: string, @CurrentUser() user: any) {
    return this.financesService.deleteCategory(id, user.organizationId);
  }

  // ── Summary & Exchange Rate ──────────────────────────────────────────

  @Get('summary')
  @ApiOperation({ summary: 'Get financial summary for a project' })
  getSummary(
    @Query('projectId') projectId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @CurrentUser() user?: any,
  ) {
    if (!projectId) throw new BadRequestException('projectId is required');
    return this.financesService.getSummary(projectId, user.organizationId, dateFrom, dateTo);
  }

  @Get('exchange-rate')
  @ApiOperation({ summary: 'Get exchange rate between two currencies' })
  async getExchangeRate(@Query('from') from: string, @Query('to') to: string) {
    if (!from || !to) throw new BadRequestException('from and to are required');
    const rate = await this.financesService.getExchangeRate(from, to);
    return { from, to, rate };
  }

  // ── Record routes ────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get finance records for a project' })
  findRecords(
    @Query('projectId') projectId: string,
    @Query('type') type?: 'INCOME' | 'EXPENSE',
    @Query('categoryId') categoryId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: any,
  ) {
    if (!projectId) throw new BadRequestException('projectId is required');
    return this.financesService.findRecords(projectId, user.organizationId, {
      type,
      categoryId,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a finance record' })
  createRecord(@Body() dto: CreateFinanceRecordDto, @CurrentUser() user: any) {
    return this.financesService.createRecord(dto, user.organizationId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a finance record' })
  updateRecord(
    @Param('id') id: string,
    @Body() dto: UpdateFinanceRecordDto,
    @CurrentUser() user: any,
  ) {
    return this.financesService.updateRecord(id, dto, user.organizationId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a finance record' })
  deleteRecord(@Param('id') id: string, @CurrentUser() user: any) {
    return this.financesService.deleteRecord(id, user.organizationId);
  }
}
