import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  Body,
  Res,
  UseGuards,
  Logger,
  ParseIntPipe,
  DefaultValuePipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ProjectAccessGuard } from './guards/project-access.guard';
import { GooglePlayAuthService } from './google-play-auth.service';
import { GooglePlayMetricsService } from './google-play-metrics.service';
import { GooglePlayReviewsService } from './google-play-reviews.service';
import { GooglePlaySyncService } from './google-play-sync.service';
import { ConnectServiceAccountDto } from './dto/connect-service-account.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { MetricsQueryDto } from './dto/metrics-query.dto';

@ApiTags('Google Play')
@ApiBearerAuth()
@Controller('google-play')
export class GooglePlayController {
  private readonly logger = new Logger(GooglePlayController.name);

  constructor(
    private readonly authService: GooglePlayAuthService,
    private readonly metricsService: GooglePlayMetricsService,
    private readonly reviewsService: GooglePlayReviewsService,
    private readonly syncService: GooglePlaySyncService,
    private readonly config: ConfigService,
  ) {}

  @Get('auth-url')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get Google Play OAuth2 authorization URL' })
  getAuthUrl(@Query('projectId') projectId: string) {
    const url = this.authService.getAuthUrl(projectId);
    return { url };
  }

  @Get('auth/callback')
  @Public()
  @ApiOperation({ summary: 'OAuth2 callback from Google' })
  async authCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const webUrl = this.config.get('WEB_URL', 'http://localhost:5173');
    let projectId: string | undefined;

    try {
      projectId = this.authService.verifyState(state);
      const tokens = await this.authService.exchangeCode(code);
      await this.authService.saveOAuthConfig(projectId, tokens);

      res.redirect(
        `${webUrl}/projects/${projectId}/settings?googlePlay=connected`,
      );
    } catch (error) {
      this.logger.error(`OAuth callback error: ${error}`);
      const errorUrl = projectId
        ? `${webUrl}/projects/${projectId}/settings?googlePlay=error`
        : `${webUrl}/settings?googlePlay=error`;
      res.redirect(errorUrl);
    }
  }

  @Post('connect/service-account')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Connect via service account JSON key' })
  async connectServiceAccount(@Body() dto: ConnectServiceAccountDto) {
    await this.authService.saveServiceAccountConfig(
      dto.projectId,
      dto.serviceAccountKey,
      dto.packageName,
    );
    return { connected: true };
  }

  @Delete('disconnect')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Disconnect Google Play integration' })
  async disconnect(
    @Query('projectId') projectId: string,
    @Query('deleteData', new DefaultValuePipe(false), ParseBoolPipe)
    deleteData: boolean,
  ) {
    await this.authService.disconnect(projectId, deleteData);
    return { disconnected: true };
  }

  @Get('status')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get Google Play connection status' })
  async getStatus(@Query('projectId') projectId: string) {
    try {
      const config = await this.authService.getConfig(projectId);
      return {
        connected: true,
        authMethod: config.authMethod,
        packageName: config.packageName,
        lastSyncAt: config.lastSyncAt,
        initialSyncCompleted: config.initialSyncCompleted,
        consecutiveFailures: config.consecutiveFailures || 0,
      };
    } catch {
      return { connected: false };
    }
  }

  @Get('metrics')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get daily metrics for a date range' })
  async getMetrics(@Query() query: MetricsQueryDto) {
    return this.metricsService.getMetrics(
      query.projectId,
      query.startDate,
      query.endDate,
    );
  }

  @Get('metrics/totals')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get metrics totals with trend comparison' })
  async getMetricsTotals(
    @Query('projectId') projectId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.metricsService.getMetricsTotals(projectId, days);
  }

  @Get('reviews')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Get paginated reviews with filters' })
  async getReviews(
    @Query('projectId') projectId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('starRating') starRating?: string,
    @Query('hasReply') hasReply?: string,
    @Query('sortBy') sortBy?: 'reviewCreatedAt' | 'starRating',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.reviewsService.getReviews(projectId, {
      page,
      limit,
      starRating: starRating ? parseInt(starRating, 10) : undefined,
      hasReply: hasReply !== undefined ? hasReply === 'true' : undefined,
      sortBy,
      sortOrder,
    });
  }

  @Post('reviews/:reviewId/reply')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Reply to a Google Play review' })
  async replyToReview(
    @Query('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: ReplyReviewDto,
  ) {
    return this.reviewsService.replyToReview(projectId, reviewId, dto.text);
  }

  @Post('reviews/:reviewId/ai-reply')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Generate AI reply suggestion for a review' })
  async generateAiReply(
    @Query('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
  ) {
    return this.reviewsService.generateAiReply(projectId, reviewId);
  }

  @Post('sync')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Trigger a manual sync' })
  async triggerSync(@Query('projectId') projectId: string) {
    await this.syncService.triggerManualSync(projectId);
    return { synced: true };
  }
}
