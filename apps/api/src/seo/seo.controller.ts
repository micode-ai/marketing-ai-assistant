import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SeoService } from './seo.service';

@ApiTags('seo')
@ApiBearerAuth()
@Controller('seo')
export class SeoController {
  constructor(private seoService: SeoService) {}

  // ── Keywords ───────────────────────────────────────────────────

  @Get('keywords')
  findKeywords(@Query('projectId') projectId: string) {
    return this.seoService.findKeywords(projectId);
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
  findCompetitors(@Query('projectId') projectId: string) {
    return this.seoService.findCompetitors(projectId);
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
