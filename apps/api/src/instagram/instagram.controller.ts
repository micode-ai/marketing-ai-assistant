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
import { InstagramService } from './instagram.service';

@ApiTags('instagram')
@ApiBearerAuth()
@Controller('instagram')
@UseGuards(ProjectAccessGuard)
export class InstagramController {
  constructor(private readonly service: InstagramService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get Instagram connection status for a project' })
  getStatus(
    @Query('projectId') projectId: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.service.getStatus(projectId, accountId);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get Instagram account + post metrics' })
  getMetrics(
    @Query('projectId') projectId: string,
    @Query('days', new DefaultValuePipe(28), ParseIntPipe) days: number,
    @Query('accountId') accountId?: string,
  ) {
    const clamped = Math.min(90, Math.max(7, days));
    return this.service.getMetrics(projectId, clamped, accountId);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Trigger a manual Instagram sync' })
  triggerSync(
    @Query('projectId') projectId: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.service.triggerSync(projectId, accountId);
  }

  @Post('advice')
  @ApiOperation({ summary: 'Generate AI advice from Instagram analytics' })
  generateAdvice(
    @Query('projectId') projectId: string,
    @Body() body: { language?: string },
    @Query('accountId') accountId?: string,
  ) {
    return this.service.generateAdvice(projectId, body?.language || 'en', accountId);
  }

  @Get('advice')
  @ApiOperation({ summary: 'Get the last persisted Instagram advice for a project' })
  getStoredAdvice(@Query('projectId') projectId: string) {
    return this.service.getStoredAdvice(projectId);
  }
}
