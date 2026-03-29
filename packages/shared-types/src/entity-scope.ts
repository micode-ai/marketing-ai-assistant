import { EntityScope, EntityLinkType, EntityModelType } from './enums';

export interface EntityLink {
  id: string;
  entityType: EntityModelType;
  sourceId: string;
  targetId: string;
  linkType: EntityLinkType;
  sourceScope: EntityScope;
  targetScope: EntityScope;
  createdBy: string;
  createdAt: string;
}

export interface PromoteEntityDto {
  entityType: EntityModelType;
  entityId: string;
  organizationId: string;
  linkType: EntityLinkType;
}

export interface DemoteEntityDto {
  entityType: EntityModelType;
  entityId: string;
  organizationId: string;
  projectId: string;
  linkType: EntityLinkType;
}

export interface OrgAnalyticsSummary {
  totalContent: number;
  totalEmailsSent: number;
  totalPageViews: number;
  totalConversions: number;
  byProject: Array<{
    projectId: string;
    projectName: string;
    content: number;
    emailsSent: number;
    pageViews: number;
    conversions: number;
  }>;
}

export interface ProjectComparison {
  projectIds: string[];
  metrics: string[];
  period: '7d' | '30d' | '90d';
  data: Array<{
    projectId: string;
    projectName: string;
    values: Record<string, number>;
  }>;
}
