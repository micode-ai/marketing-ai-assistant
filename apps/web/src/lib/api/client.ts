import { API_URL } from '$lib/config';
import { authStore } from '$stores/auth';
import { get } from 'svelte/store';

type RequestOptions = RequestInit & {
  params?: Record<string, string | number | undefined>;
};

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const { refreshToken } = get(authStore);
  if (!refreshToken) return null;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      authStore.setTokens(data.accessToken, data.refreshToken);
      if (data.user) authStore.setUser(data.user);
      return data.accessToken as string;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function handleAuthFailure(): never {
  authStore.logout();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
  throw new Error('Unauthorized');
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, ...init } = options;

  let url = `${API_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) searchParams.set(k, String(v));
    });
    const paramStr = searchParams.toString();
    if (paramStr) url += '?' + paramStr;
  }

  const buildHeaders = (): Record<string, string> => {
    const auth = get(authStore);
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    };
    if (auth.accessToken) h['Authorization'] = `Bearer ${auth.accessToken}`;
    return h;
  };

  let response = await fetch(url, { ...init, headers: buildHeaders() });

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) handleAuthFailure();
    response = await fetch(url, { ...init, headers: buildHeaders() });
    if (response.status === 401) handleAuthFailure();
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

export const api = {
  get: <T>(endpoint: string, params?: Record<string, string | number | undefined>) =>
    request<T>(endpoint, { method: 'GET', params }),
  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),
  // eslint-disable-next-line no-undef
  upload: async <T>(endpoint: string, formData: FormData): Promise<T> => {
    const url = `${API_URL}${endpoint}`;
    const buildHeaders = (): Record<string, string> => {
      const auth = get(authStore);
      const h: Record<string, string> = {};
      if (auth.accessToken) h['Authorization'] = `Bearer ${auth.accessToken}`;
      return h;
    };

    let response = await fetch(url, { method: 'POST', headers: buildHeaders(), body: formData });
    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (!newToken) handleAuthFailure();
      response = await fetch(url, { method: 'POST', headers: buildHeaders(), body: formData });
      if (response.status === 401) handleAuthFailure();
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    return response.json();
  },
};
