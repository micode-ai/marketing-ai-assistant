<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore } from '$lib/stores/projects';
  import { currentUser } from '$lib/stores/auth';

  let loading = true;
  let members: any[] = [];
  let currentRole = 'MEMBER';
  let currentUserId = '';

  let showInviteModal = false;
  let inviteForm = { email: '', role: 'MEMBER' };
  let inviteSaving = false;
  let inviteError = '';

  let removingMember: any = null;
  let showLeaveModal = false;

  let successMsg = '';
  let errorMsg = '';

  $: isAdmin = currentRole === 'OWNER' || currentRole === 'ADMIN';
  $: isOwner = currentRole === 'OWNER';

  function initials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function roleBadgeClass(role: string): string {
    switch (role) {
      case 'OWNER': return 'bg-amber-100 text-amber-700';
      case 'ADMIN': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  }

  function roleLabel(role: string): string {
    switch (role) {
      case 'OWNER': return $_('settings.owner');
      case 'ADMIN': return $_('settings.admin');
      default: return $_('settings.member');
    }
  }

  function formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }

  async function loadMembers() {
    try {
      const org = await api.get<any>(`/organizations/${$organizationIdStore}`);
      members = org.members || [];
    } catch (e: any) {
      errorMsg = e.message;
    }
  }

  onMount(async () => {
    if ($currentUser) {
      currentUserId = $currentUser.id;
    }
    await loadMembers();
    // Determine role from loaded members (reliable, matches current org)
    const me = members.find(m => m.userId === currentUserId);
    if (me) currentRole = me.role;
    loading = false;
  });

  async function inviteMember() {
    inviteSaving = true;
    inviteError = '';
    try {
      await api.post(`/organizations/${$organizationIdStore}/members/invite`, {
        email: inviteForm.email,
        role: inviteForm.role,
      });
      showInviteModal = false;
      inviteForm = { email: '', role: 'MEMBER' };
      successMsg = $_('settings.inviteSent');
      setTimeout(() => (successMsg = ''), 3000);
      await loadMembers();
    } catch (e: any) {
      inviteError = e.message;
    } finally {
      inviteSaving = false;
    }
  }

  async function removeMember() {
    if (!removingMember) return;
    const userId = removingMember.userId;
    try {
      await api.delete(`/organizations/${$organizationIdStore}/members/${userId}`);
      members = members.filter(m => m.userId !== userId);
      successMsg = $_('settings.memberRemoved');
      setTimeout(() => (successMsg = ''), 3000);
    } catch (e: any) {
      errorMsg = e.message;
      setTimeout(() => (errorMsg = ''), 3000);
    } finally {
      removingMember = null;
    }
  }

  async function leaveOrganization() {
    try {
      await api.post(`/organizations/${$organizationIdStore}/leave`);
      organizationIdStore.set(null);
      window.location.href = '/dashboard';
    } catch (e: any) {
      errorMsg = e.message;
      setTimeout(() => (errorMsg = ''), 3000);
    } finally {
      showLeaveModal = false;
    }
  }
</script>

<div class="p-6 max-w-3xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{$_('settings.teamTitle')}</h1>
      <p class="text-sm text-gray-500 mt-1">{$_('settings.teamDesc')}</p>
    </div>
    <div class="flex items-center gap-2">
      {#if !isOwner}
        <button
          on:click={() => (showLeaveModal = true)}
          class="inline-flex items-center gap-2 border border-red-200 text-red-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
          </svg>
          {$_('settings.leaveTeam')}
        </button>
      {/if}
      {#if isAdmin}
        <button
          on:click={() => { showInviteModal = true; inviteError = ''; }}
          class="inline-flex items-center gap-2 bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors duration-150 cursor-pointer"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
          </svg>
          {$_('settings.inviteMember')}
        </button>
      {/if}
    </div>
  </div>

  <!-- Messages -->
  {#if successMsg}
    <div class="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm mb-4">{successMsg}</div>
  {/if}
  {#if errorMsg}
    <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">{errorMsg}</div>
  {/if}

  {#if loading}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
    </div>
  {:else}
    <!-- Members List -->
    <div class="space-y-3">
      {#each members as member}
        <div class="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
          <!-- Avatar -->
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 overflow-hidden">
            {#if member.user?.avatarUrl}
              <img src={member.user.avatarUrl} alt={member.user.name} class="w-10 h-10 rounded-full object-cover" />
            {:else}
              {initials(member.user?.name || '')}
            {/if}
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-900 text-sm truncate">{member.user?.name || '—'}</span>
              {#if member.userId === currentUserId}
                <span class="text-xs text-gray-400">{$_('settings.you')}</span>
              {/if}
            </div>
            <div class="flex items-center gap-2 mt-0.5 flex-wrap">
              <span class="text-xs text-gray-500 truncate">{member.user?.email || ''}</span>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium {roleBadgeClass(member.role)}">{roleLabel(member.role)}</span>
              {#if member.joinedAt}
                <span class="text-xs text-gray-400">{$_('settings.joined')} {formatDate(member.joinedAt)}</span>
              {:else if member.invitedAt}
                <span class="text-xs text-gray-400">{$_('settings.invited')} {formatDate(member.invitedAt)}</span>
              {/if}
            </div>
          </div>

          <!-- Remove button -->
          {#if isAdmin && member.userId !== currentUserId && member.role !== 'OWNER'}
            <button
              on:click={() => (removingMember = member)}
              class="text-xs text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer flex-shrink-0"
            >
              {$_('settings.removeMember')}
            </button>
          {/if}
        </div>
      {/each}
    </div>

    {#if members.length === 0}
      <div class="text-center py-12 text-gray-500 text-sm">{$_('common.noData')}</div>
    {/if}
  {/if}
</div>

<!-- Invite Modal -->
{#if showInviteModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => (showInviteModal = false)}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100">
        <h2 class="text-lg font-semibold text-gray-900">{$_('settings.inviteMember')}</h2>
        <p class="text-sm text-gray-500 mt-1">{$_('settings.inviteMemberDesc')}</p>
      </div>
      <div class="p-6 space-y-4">
        {#if inviteError}
          <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{inviteError}</div>
        {/if}
        <div>
          <label for="invite-email" class="block text-xs font-medium text-gray-700 mb-1">{$_('settings.inviteEmail')}</label>
          <input
            id="invite-email"
            type="email"
            bind:value={inviteForm.email}
            placeholder="colleague@company.com"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label for="invite-role" class="block text-xs font-medium text-gray-700 mb-1">{$_('settings.inviteRole')}</label>
          <select
            id="invite-role"
            bind:value={inviteForm.role}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="ADMIN">{$_('settings.admin')}</option>
            <option value="MEMBER">{$_('settings.member')}</option>
          </select>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={inviteMember}
          disabled={inviteSaving || !inviteForm.email}
          class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-primary-700 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {inviteSaving ? $_('common.loading') : $_('settings.inviteMember')}
        </button>
        <button
          on:click={() => (showInviteModal = false)}
          class="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Leave Confirmation Modal -->
{#if showLeaveModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => (showLeaveModal = false)}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <div class="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-4">
        <svg class="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
        </svg>
      </div>
      <h2 class="text-lg font-semibold text-gray-900 mb-1">{$_('settings.leaveTeamConfirm')}</h2>
      <p class="text-sm text-gray-500 mb-6">{$_('settings.leaveTeamDesc')}</p>
      <div class="flex gap-3">
        <button
          on:click={leaveOrganization}
          class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-red-700 transition-colors duration-150 cursor-pointer"
        >
          {$_('settings.leaveTeam')}
        </button>
        <button
          on:click={() => (showLeaveModal = false)}
          class="flex-1 border border-gray-300 rounded-lg text-sm py-2.5 font-medium hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Remove Confirmation Modal -->
{#if removingMember}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => (removingMember = null)}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <div class="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-4">
        <svg class="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <h2 class="text-lg font-semibold text-gray-900 mb-1">{$_('settings.removeMemberConfirm')}</h2>
      <p class="text-sm text-gray-500 mb-1">{removingMember.user?.name || removingMember.user?.email}</p>
      <p class="text-sm text-gray-500 mb-6">{$_('settings.removeMemberDesc')}</p>
      <div class="flex gap-3">
        <button
          on:click={removeMember}
          class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-red-700 transition-colors duration-150 cursor-pointer"
        >
          {$_('settings.removeMember')}
        </button>
        <button
          on:click={() => (removingMember = null)}
          class="flex-1 border border-gray-300 rounded-lg text-sm py-2.5 font-medium hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
