import { ProjectStatus, ProjectType, SocialPlatform } from './enums';

export interface BrandVoice {
  tone: string[];
  style: string;
  keywords: string[];
  avoidWords: string[];
  examples: string[];
}

export interface ProjectGoals {
  primary: string;
  kpis: string[];
  targetLeads?: number;
  targetRevenue?: number;
}

export interface SocialLinks {
  twitter?: string;
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  website?: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  projectType: ProjectType;
  description?: string;
  websiteUrl?: string;
  logoUrl?: string;
  targetAudience?: string;
  brandVoice?: BrandVoice;
  industry?: string;
  goals?: ProjectGoals;
  socialLinks?: SocialLinks;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectApiKey {
  id: string;
  projectId: string;
  platform: SocialPlatform;
  scopes: string[];
  createdAt: Date;
}

export interface CreateProjectDto {
  name: string;
  projectType?: ProjectType;
  description?: string;
  websiteUrl?: string;
  targetAudience?: string;
  brandVoice?: BrandVoice;
  industry?: string;
  goals?: ProjectGoals;
  socialLinks?: SocialLinks;
}

export interface UpdateProjectDto extends Partial<CreateProjectDto> {
  status?: ProjectStatus;
  logoUrl?: string;
}

// ── Export / Import ──

export type ProjectExportSection =
  | 'content'
  | 'campaigns'
  | 'checklists'
  | 'documents'
  | 'emailLists'
  | 'keywords'
  | 'competitors';

export const ALL_EXPORT_SECTIONS: ProjectExportSection[] = [
  'content',
  'campaigns',
  'checklists',
  'documents',
  'emailLists',
  'keywords',
  'competitors',
];

export interface ProjectExportData {
  version: number;
  exportedAt: string;
  sections: ProjectExportSection[];
  project: {
    name: string;
    projectType: string;
    description?: string;
    websiteUrl?: string;
    logoUrl?: string;
    targetAudience?: string;
    brandVoice?: BrandVoice;
    industry?: string;
    goals?: ProjectGoals;
    socialLinks?: SocialLinks;
    status: string;
  };
  content?: ExportedContent[];
  campaigns?: ExportedCampaign[];
  checklists?: ExportedChecklist[];
  documents?: ExportedDocument[];
  emailLists?: ExportedEmailList[];
  keywords?: ExportedKeyword[];
  competitors?: ExportedCompetitor[];
}

export interface ExportedContent {
  title: string;
  body: string;
  type: string;
  platform?: string;
  status: string;
  mediaUrls: string[];
  seoMetadata?: Record<string, unknown>;
  aiGenerated: boolean;
}

export interface ExportedCampaign {
  name: string;
  type: string;
  status: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  goals?: string;
}

export interface ExportedChecklist {
  name: string;
  type: string;
  description?: string;
  isTemplate: boolean;
  items: ExportedChecklistItem[];
}

export interface ExportedChecklistItem {
  title: string;
  description?: string;
  order: number;
  priority: string;
  isCompleted: boolean;
}

export interface ExportedDocument {
  title: string;
  type: string | null;
  content?: Record<string, unknown> | string;
  contentMd?: string;
  generatedByAi: boolean;
}

export interface ExportedEmailList {
  name: string;
  description?: string;
  subscribers: ExportedSubscriber[];
}

export interface ExportedSubscriber {
  email: string;
  name?: string;
  status: string;
  metadata?: Record<string, unknown>;
}

export interface ExportedKeyword {
  keyword: string;
  searchVolume?: number | null;
  difficulty?: number | null;
  currentRank?: number | null;
  targetRank?: number | null;
  intent: string;
  url?: string | null;
  isTracking: boolean;
}

export interface ExportedCompetitor {
  name: string;
  websiteUrl: string;
  description?: string | null;
  isActive: boolean;
}

export interface ImportProjectDto {
  organizationId: string;
  data: ProjectExportData;
  sections: ProjectExportSection[];
}

export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  projectName: string;
  summary: Partial<Record<ProjectExportSection, number>>;
}
