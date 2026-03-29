import { EntityScope } from './enums';

export interface Keyword {
  id: string;
  projectId?: string;
  scope: EntityScope;
  organizationId?: string;
  keyword: string;
  searchVolume?: number | null;
  difficulty?: number | null;
  currentRank?: number | null;
  targetRank?: number | null;
  intent: string;
  url?: string | null;
  isTracking: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KeywordRankHistory {
  id: string;
  keywordId: string;
  date: string;
  rank?: number | null;
  url?: string | null;
  createdAt: string;
}

export interface CreateKeywordDto {
  projectId?: string;
  scope?: EntityScope;
  organizationId?: string;
  keyword: string;
  searchVolume?: number;
  difficulty?: number;
  targetRank?: number;
  intent?: string;
  url?: string;
}

export interface UpdateKeywordDto {
  searchVolume?: number;
  difficulty?: number;
  currentRank?: number;
  targetRank?: number;
  intent?: string;
  url?: string;
  isTracking?: boolean;
}

export interface SeoAuditInput {
  projectId: string;
  analysisType?: 'SITE_AUDIT' | 'KEYWORD_RESEARCH' | 'COMPETITOR_ANALYSIS' | 'CONTENT_OPTIMIZATION';
  url?: string;
  keywords?: string[];
  language?: string;
}

export interface SeoAuditResult {
  url: string;
  score: number;
  issues: SeoIssue[];
  recommendations: string[];
  keywordAnalysis: KeywordAnalysisItem[];
  competitorInsights: string[];
  technicalSeo: TechnicalSeoData;
}

export interface SeoIssue {
  type: 'critical' | 'warning' | 'info';
  category: string;
  description: string;
  recommendation: string;
}

export interface KeywordAnalysisItem {
  keyword: string;
  relevance: number;
  competition: string;
  suggestion: string;
}

export interface TechnicalSeoData {
  titleTag: string;
  metaDescription: string;
  h1Tags: string[];
  contentLength: number;
  hasCanonical: boolean;
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  mobileReady: boolean;
  httpsEnabled: boolean;
}
