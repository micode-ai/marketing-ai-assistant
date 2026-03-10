<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { api } from '$lib/api/client';

  let email = '';
  let name = '';
  let password = '';
  let organizationName = '';
  let loading = false;
  let error = '';
  let joinRequestPending = false;
  let pendingOrgName = '';

  async function handleRegister() {
    loading = true;
    error = '';
    try {
      const result = await api.post<{ accessToken: string; refreshToken: string; user: any; joinRequestPending?: boolean; organizationName?: string }>(
        '/auth/register',
        { email, name, password, organizationName }
      );
      authStore.setTokens(result.accessToken, result.refreshToken);
      authStore.setUser(result.user);

      if (result.joinRequestPending) {
        joinRequestPending = true;
        pendingOrgName = result.organizationName || organizationName;
      } else {
        goto('/onboarding');
      }
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
      <p class="text-primary-200 mt-1 text-sm">{$_('auth.register')}</p>
    </div>

    <!-- Card body -->
    <div class="px-8 py-7">
      {#if joinRequestPending}
        <div class="text-center py-4">
          <div class="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg class="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-gray-900 mb-2">{$_('auth.joinRequestSent')}</h2>
          <p class="text-sm text-gray-500 mb-6">{$_('auth.joinRequestDesc', { values: { organization: pendingOrgName } })}</p>
          <a
            href="/login"
            class="inline-block bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-primary-700 transition-colors duration-150"
          >
            {$_('auth.login')}
          </a>
        </div>
      {:else}
      {#if error}
        <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-5 text-sm flex items-center gap-2">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          {error}
        </div>
      {/if}

      <form on:submit|preventDefault={handleRegister} class="space-y-4">
        <div>
          <label for="reg-name" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('auth.name')}</label>
          <input
            id="reg-name"
            type="text"
            bind:value={name}
            required
            class="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-shadow duration-150"
            placeholder="John Doe"
          />
        </div>
        <div>
          <label for="reg-email" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('auth.email')}</label>
          <input
            id="reg-email"
            type="email"
            bind:value={email}
            required
            class="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-shadow duration-150"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label for="reg-org" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('auth.organizationName')}</label>
          <input
            id="reg-org"
            type="text"
            bind:value={organizationName}
            class="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-shadow duration-150"
            placeholder={$_('auth.organizationNamePlaceholder')}
          />
        </div>
        <div>
          <label for="reg-password" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('auth.password')}</label>
          <input
            id="reg-password"
            type="password"
            bind:value={password}
            required
            minlength="8"
            class="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-shadow duration-150"
            placeholder="Min. 8 characters"
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
          {loading ? $_('common.loading') : $_('auth.register')}
        </button>
      </form>

      <p class="text-center text-sm text-gray-500 mt-6">
        {$_('auth.haveAccount')}
        <a href="/login" class="text-primary-600 font-semibold hover:underline ml-1 transition-colors duration-150">{$_('auth.login')}</a>
      </p>
      {/if}
    </div>
  </div>
</div>
