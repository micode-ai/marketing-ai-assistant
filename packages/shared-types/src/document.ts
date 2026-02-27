import { DocumentType } from './enums';

export interface Document {
  id: string;
  projectId: string;
  type: DocumentType;
  title: string;
  content: Record<string, unknown> | string;
  fileUrl?: string;
  generatedByAi: boolean;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDocumentDto {
  projectId: string;
  type: DocumentType;
  title: string;
  content?: Record<string, unknown> | string;
}

export interface GenerateDocumentDto {
  projectId: string;
  type: DocumentType;
  title?: string;
  context?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}
