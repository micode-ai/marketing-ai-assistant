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
import { CurrentUser } from '../common/decorators/current-user.decorator';
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
  getStatus(@Query('projectId') projectId: string, @CurrentUser() user: any) {
    return this.service.getStatus(projectId, this.orgId(user));
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get Instagram account + post metrics' })
  getMetrics(
    @Query('projectId') projectId: string,
    @Query('days', new DefaultValuePipe(28), ParseIntPipe) days: number,
    @CurrentUser() user: any,
  ) {
    const clamped = Math.min(90, Math.max(7, days));
    return this.service.getMetrics(projectId, this.orgId(user), clamped);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Trigger a manual Instagram sync' })
  triggerSync(@Query('projectId') projectId: string, @CurrentUser() user: any) {
    return this.service.triggerSync(projectId, this.orgId(user));
  }

  @Post('advice')
  @ApiOperation({ summary: 'Generate AI advice from Instagram analytics' })
  generateAdvice(
    @Query('projectId') projectId: string,
    @Body() body: { language?: string },
    @CurrentUser() user: any,
  ) {
    return this.service.generateAdvice(
      projectId,
      this.orgId(user),
      body?.language || 'en',
    );
  }

  private orgId(user: any): string {
    return user?.memberships?.[0]?.organizationId;
  }
}
