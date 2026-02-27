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

  async function handleRegister() {
    loading = true;
    error = '';
    try {
      const result = await api.post<{ accessToken: string; refreshToken: string; user: any }>(
        '/auth/register',
        { email, name, password, organizationName }
      );
      authStore.setTokens(result.accessToken, result.refreshToken);
      authStore.setUser(result.user);
      goto('/onboarding');
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
      <p class="text-gray-500 mt-1 text-sm">{$_('auth.register')}</p>
    </div>

    {#if error}
      <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
    {/if}

    <form on:submit|preventDefault={handleRegister} class="space-y-4">
      <div>
        <label for="reg-name" class="block text-sm font-medium text-gray-700 mb-1">{$_('auth.name')}</label>
        <input id="reg-name" type="text" bind:value={name} required class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" placeholder="John Doe" />
      </div>
      <div>
        <label for="reg-email" class="block text-sm font-medium text-gray-700 mb-1">{$_('auth.email')}</label>
        <input id="reg-email" type="email" bind:value={email} required class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" placeholder="you@example.com" />
      </div>
      <div>
        <label for="reg-org" class="block text-sm font-medium text-gray-700 mb-1">{$_('auth.organizationName')}</label>
        <input id="reg-org" type="text" bind:value={organizationName} class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" placeholder={$_('auth.organizationNamePlaceholder')} />
      </div>
      <div>
        <label for="reg-password" class="block text-sm font-medium text-gray-700 mb-1">{$_('auth.password')}</label>
        <input id="reg-password" type="password" bind:value={password} required minlength="8" class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" placeholder="Min. 8 characters" />
      </div>
      <button type="submit" disabled={loading} class="w-full bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50 text-sm mt-2">
        {loading ? $_('common.loading') : $_('auth.register')}
      </button>
    </form>

    <p class="text-center text-sm text-gray-500 mt-6">
      {$_('auth.haveAccount')}
      <a href="/login" class="text-primary-600 font-medium hover:underline ml-1">{$_('auth.login')}</a>
    </p>
  </div>
</div>
