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
  BadRequestException,
  ParseIntPipe,
  DefaultValuePipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
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
      const [config, freshness] = await Promise.all([
        this.authService.getConfig(projectId),
        this.metricsService.getFreshness(projectId),
      ]);
      return {
        connected: true,
        authMethod: config.authMethod,
        packageName: config.packageName,
        lastSyncAt: config.lastSyncAt,
        initialSyncCompleted: config.initialSyncCompleted,
        consecutiveFailures: config.consecutiveFailures || 0,
        gcsBucketUri: config.gcsBucketUri || null,
        // So the dashboard can say the figures are frozen instead of implying
        // they are current.
        syncEnabled: freshness.syncEnabled,
        plan: freshness.plan,
        lastMeasuredAt: freshness.lastMeasuredAt,
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
    // Map frontend-friendly sort names to Prisma field names
    const sortByMap: Record<string, 'reviewCreatedAt' | 'starRating'> = {
      date: 'reviewCreatedAt',
      rating: 'starRating',
      reviewCreatedAt: 'reviewCreatedAt',
      starRating: 'starRating',
    };

    return this.reviewsService.getReviews(projectId, {
      page,
      limit,
      starRating: starRating ? parseInt(starRating, 10) : undefined,
      hasReply: hasReply !== undefined ? hasReply === 'true' : undefined,
      sortBy: sortBy ? sortByMap[sortBy] || 'reviewCreatedAt' : undefined,
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
  async triggerSync(
    @Query('projectId') queryProjectId: string,
    @Body('projectId') bodyProjectId: string,
  ) {
    const projectId = queryProjectId || bodyProjectId;
    await this.syncService.triggerManualSync(projectId);
    return { synced: true };
  }

  @Post('config/package-name')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Set package name for the connected app' })
  async setPackageName(
    @Body() dto: { projectId: string; packageName: string },
  ) {
    if (!dto.packageName?.match(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i)) {
      throw new BadRequestException('Invalid package name format');
    }
    await this.authService.updateConfig(dto.projectId, {
      packageName: dto.packageName,
    });
    return { success: true };
  }

  @Post('config/bucket')
  @UseGuards(ProjectAccessGuard)
  @ApiOperation({ summary: 'Set Google Cloud Storage bucket URI for CSV exports' })
  async setBucketUri(
    @Body() dto: { projectId: string; gcsBucketUri: string },
  ) {
    if (!dto.gcsBucketUri?.startsWith('gs://')) {
      throw new BadRequestException('Bucket URI must start with gs://');
    }
    // Normalize: strip trailing slashes and any /stats/* subpath — we need the bucket root
    let uri = dto.gcsBucketUri.replace(/\/+$/, '');
    uri = uri.replace(/\/stats\/.+$/, '');
    await this.authService.updateConfig(dto.projectId, {
      gcsBucketUri: uri,
    });
    return { success: true };
  }
}
