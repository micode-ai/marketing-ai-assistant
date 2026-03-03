export interface FunnelStep {
  id: string;
  projectId: string;
  name: string;
  eventType: string;
  order: number;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFunnelStepDto {
  projectId: string;
  name: string;
  eventType: string;
  order: number;
  description?: string;
}

export interface FunnelData {
  steps: FunnelStepData[];
  period: string;
  totalVisitors: number;
}

export interface FunnelStepData {
  name: string;
  eventType: string;
  count: number;
  conversionRate: number;
  dropOffRate: number;
}

export interface TrackedUser {
  id: string;
  projectId: string;
  externalUserId?: string | null;
  email?: string | null;
  traits: Record<string, unknown>;
  firstSeen: string;
  lastSeen: string;
  sessionCount: number;
  totalPageViews: number;
  firstUtm?: Record<string, string> | null;
  lastUtm?: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}
