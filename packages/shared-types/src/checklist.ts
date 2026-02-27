import { ChecklistItemPriority, ChecklistType } from './enums';

export interface Checklist {
  id: string;
  projectId: string;
  name: string;
  type: ChecklistType;
  description?: string;
  isTemplate: boolean;
  items?: ChecklistItem[];
  progress?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChecklistItem {
  id: string;
  checklistId: string;
  title: string;
  description?: string;
  isCompleted: boolean;
  completedAt?: Date;
  completedBy?: string;
  order: number;
  dueDate?: Date;
  priority: ChecklistItemPriority;
}

export interface CreateChecklistDto {
  projectId: string;
  name: string;
  type: ChecklistType;
  description?: string;
  items?: CreateChecklistItemDto[];
}

export interface CreateChecklistItemDto {
  title: string;
  description?: string;
  order: number;
  dueDate?: Date;
  priority?: ChecklistItemPriority;
}

export interface UpdateChecklistItemDto {
  title?: string;
  description?: string;
  isCompleted?: boolean;
  dueDate?: Date;
  priority?: ChecklistItemPriority;
}
