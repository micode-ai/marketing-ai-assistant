import { Controller, Get, Post, Body, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('metrics/totals')
  @ApiOperation({ summary: 'Get metrics totals (project-scoped, org-scoped, or aggregated)' })
  getMetricsTotals(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
    @Query('days') days?: number,
  ) {
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    return this.analyticsService.getMetricsTotals(
      { projectId, organizationId, aggregated: aggregated === 'true' },
      days,
    );
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get metrics (project-scoped, org-scoped, or aggregated)' })
  getMetrics(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
    @Query('days') days?: number,
  ) {
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    return this.analyticsService.getMetrics(
      { projectId, organizationId, aggregated: aggregated === 'true' },
      days,
    );
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get summary (project-scoped, org-scoped, or aggregated)' })
  getSummary(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
  ) {
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    return this.analyticsService.getSummary({ projectId, organizationId, aggregated: aggregated === 'true' });
  }

  @Post('events')
  trackEvent(@Body() dto: any) {
    return this.analyticsService.trackEvent(dto);
  }

  @Post('aggregate')
  aggregate(@Query('projectId') projectId: string) {
    return this.analyticsService.aggregateNow(projectId);
  }

  @Get('utm-breakdown')
  @ApiOperation({ summary: 'Get UTM breakdown (project-scoped, org-scoped, or aggregated)' })
  getUtmBreakdown(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
    @Query('days') days?: number,
  ) {
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    return this.analyticsService.getUtmBreakdown(
      { projectId, organizationId, aggregated: aggregated === 'true' },
      days,
    );
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Get funnel (project-scoped, org-scoped, or aggregated)' })
  getFunnel(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
    @Query('days') days?: number,
  ) {
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    return this.analyticsService.getFunnel(
      { projectId, organizationId, aggregated: aggregated === 'true' },
      days,
    );
  }

  @Get('pages')
  @ApiOperation({ summary: 'Get page analytics (project-scoped, org-scoped, or aggregated)' })
  getPageAnalytics(
    @Query('projectId') projectId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('aggregated') aggregated?: string,
    @Query('days') days?: number,
  ) {
    if (!projectId && !organizationId) {
      throw new BadRequestException('Either projectId or organizationId is required');
    }
    return this.analyticsService.getPageAnalytics(
      { projectId, organizationId, aggregated: aggregated === 'true' },
      days,
    );
  }

  @Get('funnel-steps')
  getFunnelSteps(@Query('projectId') projectId: string) {
    return this.analyticsService.getFunnelSteps(projectId);
  }

  @Post('funnel-steps')
  setFunnelSteps(@Query('projectId') projectId: string, @Body() dto: { steps: Array<{ name: string; eventType: string; order: number; description?: string }> }) {
    return this.analyticsService.setFunnelSteps(projectId, dto.steps);
  }
}
