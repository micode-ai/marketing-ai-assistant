<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore } from '$lib/stores/projects';
  import { currentUser, authStore } from '$lib/stores/auth';

  let loading = true;
  let currentRole = 'MEMBER';

  let orgForm = { name: '', logoUrl: '' };
  let orgSaving = false;
  let orgSuccess = '';
  let orgError = '';

  let userForm = { name: '', avatarUrl: '' };
  let userSaving = false;
  let userSuccess = '';
  let userError = '';

  $: isAdmin = currentRole === 'OWNER' || currentRole === 'ADMIN';

  onMount(() => {
    if ($currentUser && ($currentUser as any).memberships?.length > 0) {
      const membership = ($currentUser as any).memberships[0];
      const org = membership.organization;
      currentRole = membership.role;
      orgForm = { name: org.name || '', logoUrl: org.logoUrl || '' };
      userForm = { name: $currentUser.name || '', avatarUrl: ($currentUser as any).avatarUrl || '' };
    }
    loading = false;
  });

  $: org = ($currentUser as any)?.memberships?.[0]?.organization;
  $: planBadge = org?.plan === 'PRO'
    ? 'bg-primary-100 text-brand'
    : org?.plan === 'ENTERPRISE'
      ? 'bg-purple-100 text-purple-700'
      : 'bg-green-100 text-green-700';

  async function saveOrg() {
    orgSaving = true;
    orgError = '';
    orgSuccess = '';
    try {
      const body: any = { name: orgForm.name };
      if (orgForm.logoUrl) body.logoUrl = orgForm.logoUrl;
      await api.put(`/organizations/${$organizationIdStore}`, body);
      const user = await api.get<any>('/users/me');
      authStore.setUser(user);
      orgSuccess = $_('settings.organizationSaved');
      setTimeout(() => (orgSuccess = ''), 3000);
    } catch (e: any) {
      orgError = e.message;
    } finally {
      orgSaving = false;
    }
  }

  async function saveProfile() {
    userSaving = true;
    userError = '';
    userSuccess = '';
    try {
      const body: any = { name: userForm.name };
      if (userForm.avatarUrl) body.avatarUrl = userForm.avatarUrl;
      await api.put('/users/me', body);
      const user = await api.get<any>('/users/me');
      authStore.setUser(user);
      userSuccess = $_('settings.profileSaved');
      setTimeout(() => (userSuccess = ''), 3000);
    } catch (e: any) {
      userError = e.message;
    } finally {
      userSaving = false;
    }
  }
</script>

<div class="p-6 max-w-3xl mx-auto">
  <h1 class="text-2xl font-bold text-ink mb-1">{$_('settings.organizationTitle')}</h1>
  <p class="text-ink-muted text-sm mb-8">{$_('settings.organizationDesc')}</p>

  {#if loading}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
    </div>
  {:else}
    <!-- Organization Information -->
    <div class="bg-surface rounded-xl border border-border p-5 mb-6">
      <h2 class="text-base font-semibold text-ink mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
        {$_('settings.organizationInfo')}
      </h2>

      {#if orgSuccess}
        <div class="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm mb-4">{orgSuccess}</div>
      {/if}
      {#if orgError}
        <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">{orgError}</div>
      {/if}

      <div class="space-y-4">
        <div>
          <label for="org-name" class="block text-xs font-medium text-ink mb-1">{$_('settings.organizationName')}</label>
          <input
            id="org-name"
            type="text"
            bind:value={orgForm.name}
            disabled={!isAdmin}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
          />
        </div>

        <div>
          <label for="org-slug" class="block text-xs font-medium text-ink mb-1">{$_('settings.organizationSlug')}</label>
          <input
            id="org-slug"
            type="text"
            value={org?.slug || ''}
            disabled
            class="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface-2 text-ink-muted cursor-not-allowed"
          />
        </div>

        <div>
          <label for="org-logo" class="block text-xs font-medium text-ink mb-1">{$_('settings.organizationLogo')}</label>
          <input
            id="org-logo"
            type="text"
            bind:value={orgForm.logoUrl}
            disabled={!isAdmin}
            placeholder={$_('settings.organizationLogoPlaceholder')}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
          />
          {#if orgForm.logoUrl}
            <div class="mt-2">
              <img src={orgForm.logoUrl} alt="Logo" class="h-12 w-12 rounded-lg object-cover border border-border" on:error={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            </div>
          {/if}
        </div>

        <div>
          <label class="block text-xs font-medium text-ink mb-1">{$_('settings.organizationPlan')}</label>
          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold {planBadge}">
            {org?.plan || 'FREE'}
          </span>
        </div>

        {#if isAdmin}
          <div class="pt-2">
            <button
              on:click={saveOrg}
              disabled={orgSaving || !orgForm.name}
              class="px-5 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {orgSaving ? $_('common.loading') : $_('common.save')}
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Personal Profile -->
    <div class="bg-surface rounded-xl border border-border p-5 mb-6">
      <h2 class="text-base font-semibold text-ink mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
        {$_('settings.personalProfile')}
      </h2>
      <p class="text-xs text-ink-muted mb-4">{$_('settings.personalProfileDesc')}</p>

      {#if userSuccess}
        <div class="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm mb-4">{userSuccess}</div>
      {/if}
      {#if userError}
        <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">{userError}</div>
      {/if}

      <div class="space-y-4">
        <div>
          <label for="user-name" class="block text-xs font-medium text-ink mb-1">{$_('settings.userName')}</label>
          <input
            id="user-name"
            type="text"
            bind:value={userForm.name}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label for="user-email" class="block text-xs font-medium text-ink mb-1">{$_('settings.userEmail')}</label>
          <input
            id="user-email"
            type="email"
            value={$currentUser?.email || ''}
            disabled
            class="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface-2 text-ink-muted cursor-not-allowed"
          />
          <p class="text-xs text-ink-subtle mt-1">{$_('settings.emailReadonly')}</p>
        </div>

        <div>
          <label for="user-avatar" class="block text-xs font-medium text-ink mb-1">{$_('settings.userAvatar')}</label>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 overflow-hidden">
              {#if userForm.avatarUrl}
                <img src={userForm.avatarUrl} alt="Avatar" class="w-10 h-10 rounded-full object-cover" on:error={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              {:else}
                {$currentUser?.name?.charAt(0).toUpperCase() || 'U'}
              {/if}
            </div>
            <input
              id="user-avatar"
              type="text"
              bind:value={userForm.avatarUrl}
              placeholder={$_('settings.userAvatarPlaceholder')}
              class="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div class="pt-2">
          <button
            on:click={saveProfile}
            disabled={userSaving || !userForm.name}
            class="px-5 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {userSaving ? $_('common.loading') : $_('common.save')}
          </button>
        </div>
      </div>
    </div>

    <!-- Danger Zone -->
    {#if isAdmin}
      <div class="bg-surface rounded-xl border border-red-200 p-5">
        <h2 class="text-base font-semibold text-red-600 mb-2 flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          {$_('settings.dangerZone')}
        </h2>
        <p class="text-sm text-ink-muted mb-4">{$_('settings.dangerZoneDesc')}</p>
        <button
          disabled
          class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium opacity-50 cursor-not-allowed"
          title={$_('settings.deleteOrgNotAvailable')}
        >
          {$_('settings.deleteOrg')}
        </button>
        <p class="text-xs text-ink-subtle mt-2">{$_('settings.deleteOrgNotAvailable')}</p>
      </div>
    {/if}
  {/if}
</div>
