<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { createEventDispatcher } from 'svelte';
  import { api } from '$lib/api/client';
  import AttachEmailModal from './AttachEmailModal.svelte';

  export let campaign: any;

  const dispatch = createEventDispatcher<{ reload: any }>();

  let showAttach = false;
  let detaching: string | null = null;

  const statusBadge: Record<string, string> = {
    draft: 'bg-surface-2 text-ink-muted',
    scheduled: 'bg-yellow-100 text-yellow-700',
    sending: 'bg-blue-100 text-blue-700',
    sent: 'bg-green-100 text-green-700',
  };

  const statusLabel: Record<string, string> = {
    draft: 'campaigns.detail.statusDraft',
    scheduled: 'campaigns.detail.statusScheduled',
    sent: 'campaigns.detail.statusSent',
  };

  function formatDate(d: string): string {
    return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function emailHref(_item: any): string {
    return campaign.projectId ? `/projects/${campaign.projectId}/email` : '/email';
  }

  async function detach(id: string) {
    detaching = id;
    try {
      const updated = await api.patch<any>(`/campaigns/${campaign.id}/detach-emails`, {
        emailIds: [id],
      });
      dispatch('reload', updated);
    } catch (e: any) {
      alert(e.message);
    } finally {
      detaching = null;
    }
  }

  function onAttached(event: CustomEvent<any>) {
    showAttach = false;
    dispatch('reload', event.detail);
  }
</script>

<div class="bg-surface rounded-xl border border-border p-5">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-base font-semibold text-ink">
      {$_('campaigns.detail.emailsSection')}
      <span class="ml-1 text-sm font-normal text-ink-muted">({campaign.emailCampaigns?.length ?? 0})</span>
    </h2>
    <button
      on:click={() => (showAttach = true)}
      class="text-xs px-3 py-1.5 bg-brand text-white rounded-lg hover:brightness-110 transition-colors cursor-pointer"
    >
      + {$_('campaigns.detail.attachEmail')}
    </button>
  </div>

  {#if !campaign.emailCampaigns || campaign.emailCampaigns.length === 0}
    <p class="text-sm text-ink-muted py-6 text-center">{$_('campaigns.detail.emptyEmails')}</p>
  {:else}
    <ul class="divide-y divide-border">
      {#each campaign.emailCampaigns as item}
        <li class="py-3 flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-xs px-2 py-0.5 rounded {statusBadge[item.status] || 'bg-surface-2 text-ink-muted'}">
                {$_(statusLabel[item.status] || 'campaigns.detail.statusDraft')}
              </span>
              <span class="text-xs text-ink-subtle">{item.list?.name || ''}</span>
              {#if item.sentAt}
                <span class="text-xs text-ink-subtle">· {formatDate(item.sentAt)}</span>
              {/if}
            </div>
            <a href={emailHref(item)} class="text-sm text-ink hover:text-primary-600 truncate block">
              {item.subject}
            </a>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <a
              href={emailHref(item)}
              class="text-xs px-2 py-1 text-ink-muted hover:text-gray-700 hover:bg-surface-2 rounded cursor-pointer"
            >
              {$_('campaigns.detail.open')}
            </a>
            <button
              on:click={() => detach(item.id)}
              disabled={detaching === item.id}
              class="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded cursor-pointer disabled:opacity-50"
            >
              {$_('campaigns.detail.detach')}
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if showAttach}
  <AttachEmailModal
    campaignId={campaign.id}
    on:close={() => (showAttach = false)}
    on:done={onAttached}
  />
{/if}
