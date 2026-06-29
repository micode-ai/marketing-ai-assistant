import { api } from './client';

export interface DealStage { id: string; name: string; order: number; probability: number }
export interface Deal {
  id: string; title: string; value: number | string; currency: string;
  stageId: string | null; status: 'OPEN' | 'WON' | 'LOST';
  ownerId: string | null; contactId: string | null; companyId: string | null;
  expectedCloseDate: string | null; financeRecordId: string | null;
  stage?: DealStage | null;
  contact?: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null;
  company?: { id: string; name: string } | null;
}
export interface Forecast { openCount: number; openValue: number; weightedValue: number; wonValuePeriod: number; lostCount: number }

export const dealsApi = {
  listStages: (projectId: string) => api.get<DealStage[]>('/crm/pipeline/stages', { projectId }),
  createStage: (projectId: string, body: { name: string; probability?: number }) => api.post<DealStage>(`/crm/pipeline/stages?projectId=${projectId}`, body),
  updateStage: (projectId: string, id: string, body: Record<string, unknown>) => api.patch<DealStage>(`/crm/pipeline/stages/${id}?projectId=${projectId}`, body),
  deleteStage: (projectId: string, id: string) => api.delete(`/crm/pipeline/stages/${id}?projectId=${projectId}`),
  listDeals: (projectId: string, q: Record<string, string | undefined> = {}) => api.get<Deal[]>('/crm/deals', { projectId, ...q }),
  getDeal: (projectId: string, id: string) => api.get<Deal>(`/crm/deals/${id}`, { projectId }),
  createDeal: (projectId: string, body: Record<string, unknown>) => api.post<Deal>(`/crm/deals?projectId=${projectId}`, body),
  updateDeal: (projectId: string, id: string, body: Record<string, unknown>) => api.patch<Deal>(`/crm/deals/${id}?projectId=${projectId}`, body),
  winDeal: (projectId: string, id: string) => api.post<Deal>(`/crm/deals/${id}/win?projectId=${projectId}`),
  loseDeal: (projectId: string, id: string, body: { lostReason?: string }) => api.post<Deal>(`/crm/deals/${id}/lose?projectId=${projectId}`, body),
  reopenDeal: (projectId: string, id: string) => api.post<Deal>(`/crm/deals/${id}/reopen?projectId=${projectId}`),
  deleteDeal: (projectId: string, id: string) => api.delete(`/crm/deals/${id}?projectId=${projectId}`),
  forecast: (projectId: string) => api.get<Forecast>('/crm/deals/forecast', { projectId }),
};
