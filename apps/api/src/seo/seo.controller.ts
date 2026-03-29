import { Controller, Get, Post, Put, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SeoService } from './seo.service';

@ApiTags('seo')
@ApiBearerAuth()
@Controller('seo')
export class SeoController {
  constructor(private seoService: SeoService) {}

  // ── Keywords ───────────────────────────────────────────────────

  @Get('keywords')
  @ApiOperation({ summary: 'Get keywords (project-scoped, org-scoped, or aggregated)' })
  findKeywords(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
  ) {
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    return this.seoService.findKeywords({ projectId, organizationId, aggregated: aggregated === 'true' });
  }

  @Get('keywords/:id')
  findKeyword(@Param('id') id: string) {
    return this.seoService.findKeyword(id);
  }

  @Post('keywords')
  createKeyword(@Body() dto: any) {
    return this.seoService.createKeyword(dto);
  }

  @Put('keywords/:id')
  updateKeyword(@Param('id') id: string, @Body() dto: any) {
    return this.seoService.updateKeyword(id, dto);
  }

  @Delete('keywords/:id')
  deleteKeyword(@Param('id') id: string) {
    return this.seoService.deleteKeyword(id);
  }

  @Get('keywords/:id/history')
  getKeywordHistory(@Param('id') id: string, @Query('days') days?: number) {
    return this.seoService.getKeywordHistory(id, days);
  }

  @Post('keywords/:id/rank')
  addRankHistory(@Param('id') id: string, @Body() dto: { rank: number; url?: string }) {
    return this.seoService.addRankHistory(id, dto.rank, dto.url);
  }

  // ── Competitors ────────────────────────────────────────────────

  @Get('competitors')
  @ApiOperation({ summary: 'Get competitors (project-scoped, org-scoped, or aggregated)' })
  findCompetitors(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
  ) {
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    return this.seoService.findCompetitors({ projectId, organizationId, aggregated: aggregated === 'true' });
  }

  @Post('competitors')
  createCompetitor(@Body() dto: any) {
    return this.seoService.createCompetitor(dto);
  }

  @Put('competitors/:id')
  updateCompetitor(@Param('id') id: string, @Body() dto: any) {
    return this.seoService.updateCompetitor(id, dto);
  }

  @Delete('competitors/:id')
  deleteCompetitor(@Param('id') id: string) {
    return this.seoService.deleteCompetitor(id);
  }

  @Post('competitors/:id/snapshot')
  addCompetitorSnapshot(@Param('id') id: string, @Body() dto: { data: Record<string, unknown> }) {
    return this.seoService.addCompetitorSnapshot(id, dto.data);
  }
}
