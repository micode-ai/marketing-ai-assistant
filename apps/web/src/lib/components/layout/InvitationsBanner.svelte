<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { api } from '$lib/api/client';
  import { onMount } from 'svelte';
  import { organizationIdStore } from '$lib/stores/projects';

  let invitations: any[] = [];
  let processing: Record<string, boolean> = {};

  export async function refresh() {
    try {
      invitations = await api.get<any[]>('/invitations');
    } catch {
      invitations = [];
    }
  }

  onMount(() => {
    refresh();
  });

  async function accept(inv: any) {
    processing[inv.id] = true;
    try {
      const result = await api.post<any>(`/invitations/${inv.id}/accept`);
      invitations = invitations.filter(i => i.id !== inv.id);
      // Switch to the accepted organization and full reload to refresh user data
      if (result.organization?.id) {
        organizationIdStore.set(result.organization.id);
        window.location.href = '/dashboard';
      }
    } catch {
      // ignore
    } finally {
      processing[inv.id] = false;
    }
  }

  async function decline(inv: any) {
    processing[inv.id] = true;
    try {
      await api.post(`/invitations/${inv.id}/decline`);
      invitations = invitations.filter(i => i.id !== inv.id);
    } catch {
      // ignore
    } finally {
      processing[inv.id] = false;
    }
  }

  function roleLabel(role: string): string {
    switch (role) {
      case 'OWNER': return $_('settings.owner');
      case 'ADMIN': return $_('settings.admin');
      default: return $_('settings.member');
    }
  }
</script>

{#if invitations.length > 0}
  <div class="border-b border-amber-200 bg-amber-50">
    {#each invitations as inv (inv.id)}
      <div class="px-4 py-3 flex items-center justify-between gap-4 max-w-7xl mx-auto">
        <div class="flex items-center gap-3 min-w-0">
          <!-- Icon -->
          <div class="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <svg class="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              {#if inv.requestedAt}
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              {:else}
                <path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
              {/if}
            </svg>
          </div>
          <!-- Text -->
          <p class="text-sm text-amber-800 truncate">
            {#if inv.requestedAt}
              {$_('invitations.joinRequestPending', { values: { organization: inv.organization?.name || '' } })}
            {:else}
              {$_('invitations.youAreInvited', { values: { organization: inv.organization?.name || '', role: roleLabel(inv.role) } })}
            {/if}
          </p>
        </div>
        {#if inv.invitedAt && !inv.requestedAt}
          <div class="flex items-center gap-2 flex-shrink-0">
            <button
              on:click={() => accept(inv)}
              disabled={processing[inv.id]}
              class="inline-flex items-center bg-brand text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:brightness-110 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
            >
              {$_('invitations.accept')}
            </button>
            <button
              on:click={() => decline(inv)}
              disabled={processing[inv.id]}
              class="inline-flex items-center border border-border text-ink text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-surface-2 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
            >
              {$_('invitations.decline')}
            </button>
          </div>
        {:else if inv.requestedAt}
          <span class="text-xs text-amber-600 font-medium flex-shrink-0">{$_('invitations.awaitingApproval')}</span>
        {/if}
      </div>
    {/each}
  </div>
{/if}
