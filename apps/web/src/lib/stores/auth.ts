import { writable, derived } from 'svelte/store';
import type { User } from '@marketing-ai/shared-types';
import { browser } from '$app/environment';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
}

const initialState: AuthState = {
  user: null,
  accessToken: browser ? localStorage.getItem('accessToken') : null,
  refreshToken: browser ? localStorage.getItem('refreshToken') : null,
  loading: false,
};

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(initialState);

  return {
    subscribe,
    setTokens: (accessToken: string, refreshToken: string) => {
      if (browser) {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
      }
      update(s => ({ ...s, accessToken, refreshToken }));
    },
    setUser: (user: User) => {
      update(s => ({ ...s, user }));
    },
    logout: () => {
      if (browser) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      }
      set({ user: null, accessToken: null, refreshToken: null, loading: false });
    },
    setLoading: (loading: boolean) => {
      update(s => ({ ...s, loading }));
    },
  };
}

export const authStore = createAuthStore();
export const isAuthenticated = derived(authStore, $auth => !!$auth.accessToken);
export const currentUser = derived(authStore, $auth => $auth.user);
