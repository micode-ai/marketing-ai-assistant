import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('metrics/totals')
  getMetricsTotals(@Query('projectId') projectId: string, @Query('days') days?: number) {
    return this.analyticsService.getMetricsTotals(projectId, days);
  }

  @Get('metrics')
  getMetrics(@Query('projectId') projectId: string, @Query('days') days?: number) {
    return this.analyticsService.getMetrics(projectId, days);
  }

  @Get('summary')
  getSummary(@Query('projectId') projectId: string) {
    return this.analyticsService.getSummary(projectId);
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
  getUtmBreakdown(@Query('projectId') projectId: string, @Query('days') days?: number) {
    return this.analyticsService.getUtmBreakdown(projectId, days);
  }

  @Get('funnel')
  getFunnel(@Query('projectId') projectId: string, @Query('days') days?: number) {
    return this.analyticsService.getFunnel(projectId, days);
  }

  @Get('pages')
  getPageAnalytics(@Query('projectId') projectId: string, @Query('days') days?: number) {
    return this.analyticsService.getPageAnalytics(projectId, days);
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
