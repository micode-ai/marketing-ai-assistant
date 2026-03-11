import { DocumentType } from './enums';

export interface Document {
  id: string;
  projectId: string;
  type: DocumentType;
  title: string;
  content: Record<string, unknown> | string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
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

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const ALLOWED_DOCUMENT_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword', // doc
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'text/plain',
  'text/csv',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];
