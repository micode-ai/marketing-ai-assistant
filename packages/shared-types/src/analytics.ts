import { AnalyticsEventType, EntityScope } from './enums';

export interface AnalyticsEvent {
  id: string;
  projectId?: string;
  scope: EntityScope;
  organizationId?: string;
  campaignId?: string;
  type: AnalyticsEventType;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface DailyMetrics {
  id: string;
  projectId: string;
  date: Date;
  metrics: {
    visitors: number;
    leads: number;
    conversions: number;
    emailsSent: number;
    emailOpens: number;
    emailClicks: number;
    socialReach: number;
    socialEngagements: number;
  };
}

export interface MetricsSummary {
  period: 'day' | 'week' | 'month';
  total: DailyMetrics['metrics'];
  change: Record<keyof DailyMetrics['metrics'], number>;
  trend: Record<keyof DailyMetrics['metrics'], 'up' | 'down' | 'stable'>;
}
