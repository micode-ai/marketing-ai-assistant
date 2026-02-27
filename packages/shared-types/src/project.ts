import { ProjectStatus, SocialPlatform } from './enums';

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
