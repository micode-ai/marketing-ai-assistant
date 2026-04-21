import { Controller, Get, Post, Put, Delete, Body, Param, Query, BadRequestException, UseGuards, HttpCode, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SeoService } from './seo.service';
import { CseConfigService } from './cse-config.service';
import { RankTrackingService } from './rank-tracking.service';
import { ConfigureCseDto } from './dto/configure-cse.dto';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { KeywordAccessGuard } from '../common/guards/keyword-access.guard';

@ApiTags('seo')
@ApiBearerAuth()
@Controller('seo')
export class SeoController {
  constructor(
    private seoService: SeoService,
    private cseConfig: CseConfigService,
    private rankTracking: RankTrackingService,
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
      // Map CSE_NOT_CONFIGURED surfaced as a skipped result gets returned normally (not thrown).
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

  // ── CSE Config ─────────────────────────────────────────────────

  @Post('cse/config')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Save Google CSE credentials for a project' })
  async configureCse(@Body() dto: ConfigureCseDto) {
    await this.cseConfig.saveCredentials(dto.projectId, { apiKey: dto.apiKey, cseId: dto.cseId });
    return { status: 'ok' };
  }

  @Get('cse/config/:projectId')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get CSE configuration status for a project' })
  async getCseStatus(@Param('projectId') projectId: string) {
    return this.cseConfig.getStatus(projectId);
  }

  @Delete('cse/config/:projectId')
  @UseGuards(ProjectAccessGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Clear CSE credentials for a project' })
  async clearCse(@Param('projectId') projectId: string) {
    await this.cseConfig.clearCredentials(projectId);
  }
}
