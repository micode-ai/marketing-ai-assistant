import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get('sessions')
  findSessions(@CurrentUser() user: any, @Query('projectId') projectId?: string) {
    return this.chatService.findSessions(user.id, projectId);
  }

  @Get('sessions/:id')
  findSession(@Param('id') id: string) {
    return this.chatService.findSession(id);
  }

  @Post('sessions')
  createSession(
    @CurrentUser() user: any,
    @Body() dto: { projectId?: string; title?: string },
  ) {
    return this.chatService.createSession(user.id, dto.projectId, dto.title);
  }

  @Put('sessions/:id')
  updateSessionTitle(@Param('id') id: string, @Body() dto: { title: string }) {
    return this.chatService.updateSessionTitle(id, dto.title);
  }

  @Delete('sessions/:id')
  deleteSession(@Param('id') id: string) {
    return this.chatService.deleteSession(id);
  }

  @Get('sessions/:id/messages')
  getMessages(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.chatService.getMessages(id, limit ? parseInt(limit, 10) : undefined);
  }

  @Post('sessions/:id/messages')
  addMessage(
    @Param('id') id: string,
    @Body() dto: { role: string; content: string; tokensUsed?: number; cost?: number },
  ) {
    return this.chatService.addMessage(id, dto.role, dto.content, dto.tokensUsed, dto.cost);
  }
}
