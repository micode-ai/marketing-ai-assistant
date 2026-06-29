import { api } from './client';

export interface CrmContact {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  companyId: string | null;
  company?: { id: string; name: string } | null;
  ownerId: string | null;
  source: string;
  status: string;
  tags: string[];
  notes: string | null;
  lastSeen: string | null;
  firstUtm: unknown;
  lastUtm: unknown;
}

export interface ContactsPage {
  items: CrmContact[];
  total: number;
  page: number;
  pageSize: number;
}

export const crmApi = {
  listContacts: (projectId: string, q: Record<string, string | number | undefined> = {}) =>
    api.get<ContactsPage>('/crm/contacts', { projectId, ...q }),
  getContact: (projectId: string, id: string) => api.get<CrmContact>(`/crm/contacts/${id}`, { projectId }),
  createContact: (projectId: string, body: Partial<CrmContact>) =>
    api.post<CrmContact>(`/crm/contacts?projectId=${projectId}`, body),
  updateContact: (projectId: string, id: string, body: Partial<CrmContact>) =>
    api.patch<CrmContact>(`/crm/contacts/${id}?projectId=${projectId}`, body),
  deleteContact: (projectId: string, id: string) => api.delete(`/crm/contacts/${id}?projectId=${projectId}`),
  syncContacts: (projectId: string) =>
    api.post<{ created: number; updated: number; capped: boolean }>(`/crm/contacts/sync?projectId=${projectId}`),
  // companies
  listCompanies: (projectId: string, search?: string) =>
    api.get<{ items: unknown[]; total: number }>('/crm/companies', { projectId, search }),
  getCompany: (projectId: string, id: string) => api.get<unknown>(`/crm/companies/${id}`, { projectId }),
  createCompany: (projectId: string, body: unknown) => api.post<unknown>(`/crm/companies?projectId=${projectId}`, body),
  updateCompany: (projectId: string, id: string, body: unknown) => api.patch<unknown>(`/crm/companies/${id}?projectId=${projectId}`, body),
  deleteCompany: (projectId: string, id: string) => api.delete(`/crm/companies/${id}?projectId=${projectId}`),
};
