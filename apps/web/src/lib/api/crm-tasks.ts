import { api } from './client';

export interface CrmTask {
  id: string; title: string; description: string | null; dueDate: string | null;
  status: 'OPEN' | 'DONE'; completedAt: string | null; ownerId: string | null;
  contactId: string | null; dealId: string | null; companyId: string | null;
  owner?: { id: string; name: string } | null;
  contact?: { id: string; firstName: string | null; lastName: string | null } | null;
  deal?: { id: string; title: string } | null;
}
export interface CrmActivity {
  id: string; type: 'NOTE' | 'CALL' | 'EMAIL' | 'MEETING'; body: string; occurredAt: string;
  ownerId: string | null; contactId: string | null; dealId: string | null; companyId: string | null;
  owner?: { id: string; name: string } | null;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TimelineItem { kind: 'activity' | 'task'; id: string; date: string; data: any }

export const tasksApi = {
  listTasks: (projectId: string, q: Record<string, string | undefined> = {}) =>
    api.get<CrmTask[]>('/crm/tasks', { projectId, ...q }),
  summary: (projectId: string, ownerId?: string) =>
    api.get<{ overdue: number; today: number; upcoming: number }>('/crm/tasks/summary', { projectId, ownerId }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createTask: (projectId: string, body: any) =>
    api.post<CrmTask>(`/crm/tasks?projectId=${projectId}`, body),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateTask: (projectId: string, id: string, body: any) =>
    api.patch<CrmTask>(`/crm/tasks/${id}?projectId=${projectId}`, body),
  completeTask: (projectId: string, id: string) =>
    api.post<CrmTask>(`/crm/tasks/${id}/complete?projectId=${projectId}`),
  reopenTask: (projectId: string, id: string) =>
    api.post<CrmTask>(`/crm/tasks/${id}/reopen?projectId=${projectId}`),
  deleteTask: (projectId: string, id: string) =>
    api.delete(`/crm/tasks/${id}?projectId=${projectId}`),
  listActivities: (projectId: string, q: Record<string, string | undefined> = {}) =>
    api.get<CrmActivity[]>('/crm/activities', { projectId, ...q }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createActivity: (projectId: string, body: any) =>
    api.post<CrmActivity>(`/crm/activities?projectId=${projectId}`, body),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateActivity: (projectId: string, id: string, body: any) =>
    api.patch<CrmActivity>(`/crm/activities/${id}?projectId=${projectId}`, body),
  deleteActivity: (projectId: string, id: string) =>
    api.delete(`/crm/activities/${id}?projectId=${projectId}`),
  timeline: (projectId: string, q: { contactId?: string; dealId?: string }) =>
    api.get<TimelineItem[]>('/crm/timeline', { projectId, ...q }),
};
