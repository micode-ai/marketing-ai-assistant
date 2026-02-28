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
  <div class="bg-white rounded-2xl shadow-2xl overflow-hidden">
    <!-- Gradient header band -->
    <div class="bg-gradient-to-br from-primary-600 to-violet-700 px-8 pt-8 pb-7 text-white text-center">
      <div class="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-white/30">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
        </svg>
      </div>
      <h1 class="text-2xl font-bold" style="font-family: 'Space Grotesk', sans-serif;">Marketing AI</h1>
      <p class="text-primary-200 mt-1 text-sm">{$_('auth.login')}</p>
    </div>

    <!-- Card body -->
    <div class="px-8 py-7">
      {#if error}
        <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-5 text-sm flex items-center gap-2">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          {error}
        </div>
      {/if}

      <form on:submit|preventDefault={handleLogin} class="space-y-4">
        <div>
          <label for="login-email" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('auth.email')}</label>
          <input
            id="login-email"
            type="email"
            bind:value={email}
            required
            class="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-shadow duration-150"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <div class="flex justify-between items-center mb-1.5">
            <label for="login-password" class="block text-sm font-medium text-gray-700">{$_('auth.password')}</label>
            <a href="/forgot-password" class="text-xs text-primary-600 hover:text-primary-700 hover:underline transition-colors duration-150">{$_('auth.forgotPassword')}</a>
          </div>
          <input
            id="login-password"
            type="password"
            bind:value={password}
            required
            class="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-shadow duration-150"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          class="w-full bg-primary-600 text-white py-2.5 rounded-lg font-semibold hover:bg-primary-700 active:bg-primary-800 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-sm mt-1 shadow-sm shadow-primary-200 flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if loading}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          {/if}
          {loading ? $_('common.loading') : $_('auth.login')}
        </button>
      </form>

      <div class="relative my-6">
        <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-200"></div></div>
        <div class="relative flex justify-center text-xs"><span class="bg-white px-3 text-gray-400">{$_('auth.orContinueWith')}</span></div>
      </div>

      <a href="/api/auth/google" class="w-full flex items-center justify-center gap-2.5 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors duration-150 font-medium cursor-pointer">
        <svg class="w-4 h-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {$_('auth.continueWith', { values: { provider: 'Google' } })}
      </a>

      <p class="text-center text-sm text-gray-500 mt-6">
        {$_('auth.noAccount')}
        <a href="/register" class="text-primary-600 font-semibold hover:underline ml-1 transition-colors duration-150">{$_('auth.register')}</a>
      </p>
    </div>
  </div>
</div>
