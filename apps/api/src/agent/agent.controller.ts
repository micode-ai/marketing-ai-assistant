import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AgentService } from './agent.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('agent')
@ApiBearerAuth()
@Controller('agent')
export class AgentController {
  constructor(private agentService: AgentService) {}

  @Post('run')
  @ApiOperation({ summary: 'Run AI agent task' })
  runAgent(@Body() dto: { projectId: string; agentType: string; input: Record<string, unknown> }) {
    return this.agentService.runAgent(dto);
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
  chat(@Body() dto: { projectId?: string; message: string; history?: any[] }) {
    return this.agentService.chat(dto);
  }
}
