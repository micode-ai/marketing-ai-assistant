import { AgentRunStatus, AgentType } from './enums';

export interface AgentRun {
  id: string;
  projectId: string;
  agentType: AgentType;
  status: AgentRunStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  tokensUsed?: number;
  cost?: number;
  duration?: number;
  error?: string;
  langsmithRunId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentSchedule {
  id: string;
  projectId: string;
  agentType: AgentType;
  cronExpression: string;
  isActive: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  config: Record<string, unknown>;
}

export interface RunAgentDto {
  projectId: string;
  agentType: AgentType;
  input: Record<string, unknown>;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  projectId?: string;
  messages: AgentMessage[];
  createdAt: Date;
}
