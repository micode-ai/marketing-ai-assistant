import { Controller, Get, Post, Put, Delete, Body, Param, Query, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { AgentService } from './agent.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

// Every handler checks that the caller belongs to the organization owning the project
// (AgentService.assertProjectAccess). Without it any signed-in user could run agents on,
// read the runs of, and edit the schedules of any project by passing its id.
@ApiTags('agent')
@ApiBearerAuth()
@Controller('agent')
export class AgentController {
  constructor(
    private agentService: AgentService,
    private configService: ConfigService,
  ) {}

  @Post('run')
  @ApiOperation({ summary: 'Run AI agent task' })
  async runAgent(@Body() dto: { projectId: string; agentType: string; input: Record<string, unknown> }, @CurrentUser() user: any) {
    await this.agentService.assertProjectAccess(user, dto?.projectId);
    return this.agentService.runAgent({ ...dto, userId: user.id });
  }

  @Get('runs')
  @ApiOperation({ summary: 'Get agent runs for project' })
  async getRuns(@Query('projectId') projectId: string, @CurrentUser() user: any) {
    await this.agentService.assertProjectAccess(user, projectId);
    return this.agentService.getRuns(projectId);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Get agent run by ID' })
  async getRunById(@Param('id') id: string, @CurrentUser() user: any) {
    const run = await this.agentService.getRunById(id);
    if (!run) return null;
    await this.agentService.assertProjectAccess(user, run.projectId);
    return run;
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI assistant' })
  async chat(@Body() dto: { projectId?: string; message: string; history?: any[] }, @CurrentUser() user: any) {
    if (dto?.projectId) await this.agentService.assertProjectAccess(user, dto.projectId);
    return this.agentService.chat(dto, user.id);
  }

  @Get('schedules')
  @ApiOperation({ summary: 'Get agent schedules for project' })
  async getSchedules(@Query('projectId') projectId: string, @CurrentUser() user: any) {
    await this.agentService.assertProjectAccess(user, projectId);
    return this.agentService.getSchedules(projectId);
  }

  @Post('schedules')
  @ApiOperation({ summary: 'Create agent schedule' })
  async createSchedule(@Body() dto: { projectId: string; agentType: string; cronExpression: string; config?: Record<string, unknown> }, @CurrentUser() user: any) {
    await this.agentService.assertProjectAccess(user, dto?.projectId);
    return this.agentService.createSchedule(dto);
  }

  @Put('schedules/:id')
  @ApiOperation({ summary: 'Update agent schedule' })
  async updateSchedule(@Param('id') id: string, @Body() dto: { cronExpression?: string; isActive?: boolean; config?: Record<string, unknown> }, @CurrentUser() user: any) {
    await this.agentService.assertScheduleAccess(user, id);
    return this.agentService.updateSchedule(id, dto);
  }

  @Delete('schedules/:id')
  @ApiOperation({ summary: 'Delete agent schedule' })
  async deleteSchedule(@Param('id') id: string, @CurrentUser() user: any) {
    await this.agentService.assertScheduleAccess(user, id);
    return this.agentService.deleteSchedule(id);
  }

  @Public()
  @Post('run-internal')
  @ApiOperation({ summary: 'Internal: run agent from AI chat (secret-based auth)' })
  async runInternal(
    @Headers('x-agent-secret') secret: string,
    @Body() dto: { userId: string; projectId: string; agentType: string; input: Record<string, unknown> },
  ) {
    if (!this.isValidAgentSecret(secret)) {
      throw new UnauthorizedException('Invalid agent secret');
    }
    // The chat agent passes the user it acts for; that user must belong to the project's organization.
    await this.agentService.assertUserIdProjectAccess(dto?.userId, dto?.projectId);
    return this.agentService.runAgent(dto);
  }

  private isValidAgentSecret(provided: string | undefined): boolean {
    const expected = this.configService.get<string>('AGENT_SECRET');
    // An unset or short secret must never authenticate (undefined === undefined would).
    if (!expected || expected.length < 32 || typeof provided !== 'string') return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
