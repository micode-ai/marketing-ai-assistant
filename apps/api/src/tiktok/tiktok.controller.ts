import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { TikTokService } from './tiktok.service';

/**
 * Project-scoped TikTok analytics. The OAuth routes live in
 * TikTokOAuthController, which is org-scoped and cannot use ProjectAccessGuard.
 */
@ApiTags('tiktok')
@ApiBearerAuth()
@Controller('tiktok')
@UseGuards(ProjectAccessGuard)
export class TikTokController {
  constructor(private readonly service: TikTokService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get TikTok connection status for a project' })
  getStatus(@Query('projectId') projectId: string) {
    return this.service.getStatus(projectId);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get TikTok account snapshots + per-video metrics' })
  getMetrics(
    @Query('projectId') projectId: string,
    @Query('days', new DefaultValuePipe(28), ParseIntPipe) days: number,
  ) {
    const clamped = Math.min(90, Math.max(7, days));
    return this.service.getMetrics(projectId, clamped);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Trigger a manual TikTok sync' })
  triggerSync(@Query('projectId') projectId: string) {
    return this.service.triggerSync(projectId);
  }

  @Post('advice')
  @ApiOperation({ summary: 'Generate AI advice from TikTok analytics' })
  generateAdvice(
    @Query('projectId') projectId: string,
    @Body() body: { language?: string },
  ) {
    return this.service.generateAdvice(projectId, body?.language || 'en');
  }

  @Get('advice')
  @ApiOperation({ summary: 'Get the last persisted TikTok advice for a project' })
  getStoredAdvice(@Query('projectId') projectId: string) {
    return this.service.getStoredAdvice(projectId);
  }
}
