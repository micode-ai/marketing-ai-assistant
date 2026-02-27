<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { api } from '$lib/api/client';

  let email = '';
  let password = '';
  let loading = false;
  let error = '';

  async function handleLogin() {
    loading = true;
    error = '';
    try {
      const result = await api.post<{ accessToken: string; refreshToken: string; user: any }>('/auth/login', { email, password });
      authStore.setTokens(result.accessToken, result.refreshToken);
      authStore.setUser(result.user);
      goto('/dashboard');
    } catch (e: any) {
      error = e.message || $_('errors.generic');
    } finally {
      loading = false;
    }
  }
</script>

<div class="w-full max-w-md">
  <div class="bg-white rounded-2xl shadow-xl p-8">
    <div class="text-center mb-8">
      <div class="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">M</div>
      <h1 class="text-2xl font-bold text-gray-900">Marketing AI</h1>
      <p class="text-gray-500 mt-1 text-sm">{$_('auth.login')}</p>
    </div>

    {#if error}
      <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
    {/if}

    <form on:submit|preventDefault={handleLogin} class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{$_('auth.email')}</label>
        <input
          type="email"
          bind:value={email}
          required
          class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <div class="flex justify-between items-center mb-1">
          <label class="block text-sm font-medium text-gray-700">{$_('auth.password')}</label>
          <a href="/forgot-password" class="text-xs text-primary-600 hover:underline">{$_('auth.forgotPassword')}</a>
        </div>
        <input
          type="password"
          bind:value={password}
          required
          class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          placeholder="••••••••"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        class="w-full bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm mt-2"
      >
        {loading ? $_('common.loading') : $_('auth.login')}
      </button>
    </form>

    <div class="relative my-6">
      <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-200"></div></div>
      <div class="relative flex justify-center text-xs"><span class="bg-white px-2 text-gray-400">{$_('auth.orContinueWith')}</span></div>
    </div>

    <a href="/api/auth/google" class="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
      <svg class="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      {$_('auth.continueWith', { values: { provider: 'Google' } })}
    </a>

    <p class="text-center text-sm text-gray-500 mt-6">
      {$_('auth.noAccount')}
      <a href="/register" class="text-primary-600 font-medium hover:underline ml-1">{$_('auth.register')}</a>
    </p>
  </div>
</div>
