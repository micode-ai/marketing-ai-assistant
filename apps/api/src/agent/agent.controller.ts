import { Controller, Get, Post, Put, Delete, Body, Param, Query, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AgentService } from './agent.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

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
  runAgent(@Body() dto: { projectId: string; agentType: string; input: Record<string, unknown> }, @CurrentUser() user: any) {
    return this.agentService.runAgent({ ...dto, userId: user.id });
  }

  @Get('runs')
  @ApiOperation({ summary: 'Get agent runs for project' })
  getRuns(@Query('projectId') projectId: string) {
    return this.agentService.getRuns(projectId);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Get agent run by ID' })
  getRunById(@Param('id') id: string) {
    return this.agentService.getRunById(id);
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI assistant' })
  chat(@Body() dto: { projectId?: string; message: string; history?: any[] }, @CurrentUser() user: any) {
    return this.agentService.chat(dto, user.id);
  }

  @Get('schedules')
  @ApiOperation({ summary: 'Get agent schedules for project' })
  getSchedules(@Query('projectId') projectId: string) {
    return this.agentService.getSchedules(projectId);
  }

  @Post('schedules')
  @ApiOperation({ summary: 'Create agent schedule' })
  createSchedule(@Body() dto: { projectId: string; agentType: string; cronExpression: string; config?: Record<string, unknown> }) {
    return this.agentService.createSchedule(dto);
  }

  @Put('schedules/:id')
  @ApiOperation({ summary: 'Update agent schedule' })
  updateSchedule(@Param('id') id: string, @Body() dto: { cronExpression?: string; isActive?: boolean; config?: Record<string, unknown> }) {
    return this.agentService.updateSchedule(id, dto);
  }

  @Delete('schedules/:id')
  @ApiOperation({ summary: 'Delete agent schedule' })
  deleteSchedule(@Param('id') id: string) {
    return this.agentService.deleteSchedule(id);
  }

  @Public()
  @Post('run-internal')
  @ApiOperation({ summary: 'Internal: run agent from AI chat (secret-based auth)' })
  async runInternal(
    @Headers('x-agent-secret') secret: string,
    @Body() dto: { userId: string; projectId: string; agentType: string; input: Record<string, unknown> },
  ) {
    if (secret !== this.configService.get('AGENT_SECRET')) {
      throw new UnauthorizedException('Invalid agent secret');
    }
    return this.agentService.runAgent(dto);
  }
}
