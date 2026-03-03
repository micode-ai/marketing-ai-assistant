export interface Competitor {
  id: string;
  projectId: string;
  name: string;
  websiteUrl: string;
  description?: string | null;
  lastCheckedAt?: string | null;
  isActive: boolean;
  snapshots?: CompetitorSnapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorSnapshot {
  id: string;
  competitorId: string;
  date: string;
  data: Record<string, unknown>;
  changes?: Record<string, unknown> | null;
  createdAt: string;
}

export interface CreateCompetitorDto {
  projectId: string;
  name: string;
  websiteUrl: string;
  description?: string;
}

export interface UpdateCompetitorDto {
  name?: string;
  websiteUrl?: string;
  description?: string;
  isActive?: boolean;
}
