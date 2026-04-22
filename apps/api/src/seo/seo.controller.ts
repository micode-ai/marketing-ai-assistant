import { Controller, Get, Post, Put, Delete, Body, Param, Query, BadRequestException, UseGuards, HttpCode, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CompetitorStatus } from '@prisma/client';
import { SeoService } from './seo.service';
import { BraveSearchConfigService } from './brave-search-config.service';
import { RankTrackingService } from './rank-tracking.service';
import { CompetitorSuggestionService } from './competitor-suggestion.service';
import { ConfigureBraveDto } from './dto/configure-brave.dto';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { KeywordAccessGuard } from '../common/guards/keyword-access.guard';
import { CompetitorAccessGuard } from '../common/guards/competitor-access.guard';

@ApiTags('seo')
@ApiBearerAuth()
@Controller('seo')
export class SeoController {
  constructor(
    private seoService: SeoService,
    private braveConfig: BraveSearchConfigService,
    private rankTracking: RankTrackingService,
    private competitorSuggestion: CompetitorSuggestionService,
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
  addRankHistory(@Param('id') id: string, @Body() dto: { rank: number; url?: string }) {
    return this.seoService.addRankHistory(id, dto.rank, dto.url);
  }

  @Post('keywords/:id/check-now')
  @UseGuards(KeywordAccessGuard)
  @ApiOperation({ summary: 'Manually trigger a rank check for a keyword (max 3/hour)' })
  async checkNow(@Param('id') id: string) {
    try {
      return await this.rankTracking.checkKeyword(id, 'manual');
    } catch (err) {
      if (err instanceof HttpException) throw err; // pass through 429 + rank-tracking errors
      // Map BRAVE_NOT_CONFIGURED surfaced as a skipped result gets returned normally (not thrown).
      throw err;
    }
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

  // ── Brave Search Config ────────────────────────────────────────

  @Post('brave/config')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Save Brave Search API key for a project' })
  async configureBrave(@Body() dto: ConfigureBraveDto) {
    await this.braveConfig.saveCredentials(dto.projectId, { apiKey: dto.apiKey });
    return { status: 'ok' };
  }

  @Get('brave/config/:projectId')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get Brave Search configuration status for a project' })
  async getBraveStatus(@Param('projectId') projectId: string) {
    return this.braveConfig.getStatus(projectId);
  }

  @Delete('brave/config/:projectId')
  @UseGuards(ProjectAccessGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Clear Brave Search credentials for a project' })
  async clearBrave(@Param('projectId') projectId: string) {
    await this.braveConfig.clearCredentials(projectId);
  }
}
