import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async findSessions(userId: string, projectId?: string) {
    return this.prisma.chatSession.findMany({
      where: {
        userId,
        ...(projectId ? { projectId } : {}),
      },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findSession(id: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) throw new NotFoundException('Chat session not found');
    return session;
  }

  async createSession(userId: string, projectId?: string, title?: string) {
    return this.prisma.chatSession.create({
      data: {
        userId,
        projectId,
        title: title || 'New Chat',
      },
    });
  }

  async updateSessionTitle(id: string, title: string) {
    return this.prisma.chatSession.update({
      where: { id },
      data: { title },
    });
  }

  async deleteSession(id: string) {
    return this.prisma.chatSession.delete({ where: { id } });
  }

  async addMessage(
    sessionId: string,
    role: string,
    content: string,
    tokensUsed?: number,
    cost?: number,
  ) {
    const message = await this.prisma.chatMessage.create({
      data: { sessionId, role, content, tokensUsed, cost },
    });

    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  async getMessages(sessionId: string, limit = 50) {
    return this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: { session: { select: { userId: true } } },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.session.userId !== userId) {
      throw new NotFoundException('Message not found');
    }
    return this.prisma.chatMessage.delete({ where: { id: messageId } });
  }
}
