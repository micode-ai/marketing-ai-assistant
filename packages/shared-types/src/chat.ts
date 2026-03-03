export interface ChatSession {
  id: string;
  projectId?: string | null;
  userId: string;
  title: string;
  messages?: ChatMessageRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  tokensUsed?: number | null;
  cost?: number | null;
  createdAt: string;
}

export interface CreateChatSessionDto {
  projectId?: string;
  title?: string;
}

export interface SendChatMessageDto {
  sessionId: string;
  message: string;
  projectId?: string;
}
