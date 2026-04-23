import { Controller, Get, Post, Put, Delete, Body, Param, Query, BadRequestException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CompetitorStatus } from '@prisma/client';
import { SeoService } from './seo.service';
import { CompetitorSuggestionService } from './competitor-suggestion.service';
import { GscSyncService } from './gsc-sync.service';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CompetitorAccessGuard } from '../common/guards/competitor-access.guard';

@ApiTags('seo')
@ApiBearerAuth()
@Controller('seo')
export class SeoController {
  constructor(
    private seoService: SeoService,
    private competitorSuggestion: CompetitorSuggestionService,
    private gscSync: GscSyncService,
  ) {}

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
  @ApiOperation({ summary: 'Manually record a rank position for a keyword' })
  addRankHistory(@Param('id') id: string, @Body() dto: { rank: number | null; url?: string }) {
    return this.seoService.addRankHistory(id, dto.rank, dto.url);
  }

  @Post('keywords/sync-from-gsc')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Sync rank positions from Google Search Console for all tracked keywords' })
  syncFromGsc(@Body() dto: { projectId: string }) {
    if (!dto.projectId) {
      throw new BadRequestException('projectId is required');
    }
    return this.gscSync.syncProject(dto.projectId);
  }

  // ── Competitors ────────────────────────────────────────────────

  @Get('competitors')
  @ApiOperation({ summary: 'Get competitors (project-scoped, org-scoped, or aggregated)' })
  findCompetitors(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
    @Query('status') status?: string,
  ) {
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    const parsedStatus = status && Object.values(CompetitorStatus).includes(status as CompetitorStatus)
      ? (status as CompetitorStatus)
      : undefined;
    return this.seoService.findCompetitors({ projectId, organizationId, aggregated: aggregated === 'true', status: parsedStatus });
  }

  @Post('competitors/suggest')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Use AI to suggest competitors for a project' })
  suggestCompetitors(@Body() dto: { projectId: string }) {
    return this.competitorSuggestion.suggest(dto.projectId);
  }

  @Post('competitors')
  createCompetitor(@Body() dto: any) {
    return this.seoService.createCompetitor(dto);
  }

  @Put('competitors/:id')
  updateCompetitor(@Param('id') id: string, @Body() dto: any) {
    return this.seoService.updateCompetitor(id, dto);
  }

  @Post('competitors/:id/approve')
  @UseGuards(CompetitorAccessGuard)
  @ApiOperation({ summary: 'Approve a suggested competitor (sets status to ACTIVE)' })
  approveCompetitor(@Param('id') id: string) {
    return this.seoService.updateCompetitor(id, { status: CompetitorStatus.ACTIVE, approvedAt: new Date() });
  }

  @Post('competitors/:id/dismiss')
  @UseGuards(CompetitorAccessGuard)
  @ApiOperation({ summary: 'Dismiss a suggested competitor' })
  dismissCompetitor(@Param('id') id: string) {
    return this.seoService.updateCompetitor(id, { status: CompetitorStatus.DISMISSED });
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
