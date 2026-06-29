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
import { ThreadsService } from './threads.service';

@ApiTags('threads')
@ApiBearerAuth()
@Controller('threads')
@UseGuards(ProjectAccessGuard)
export class ThreadsController {
  constructor(private readonly service: ThreadsService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get Threads connection status for a project' })
  getStatus(@Query('projectId') projectId: string) {
    return this.service.getStatus(projectId);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get Threads account + post metrics' })
  getMetrics(
    @Query('projectId') projectId: string,
    @Query('days', new DefaultValuePipe(28), ParseIntPipe) days: number,
  ) {
    const clamped = Math.min(90, Math.max(7, days));
    return this.service.getMetrics(projectId, clamped);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Trigger a manual Threads sync' })
  triggerSync(@Query('projectId') projectId: string) {
    return this.service.triggerSync(projectId);
  }

  @Post('advice')
  @ApiOperation({ summary: 'Generate AI advice from Threads analytics' })
  generateAdvice(
    @Query('projectId') projectId: string,
    @Body() body: { language?: string },
  ) {
    return this.service.generateAdvice(projectId, body?.language || 'en');
  }

  @Get('advice')
  @ApiOperation({ summary: 'Get the last persisted Threads advice for a project' })
  getStoredAdvice(@Query('projectId') projectId: string) {
    return this.service.getStoredAdvice(projectId);
  }
}
