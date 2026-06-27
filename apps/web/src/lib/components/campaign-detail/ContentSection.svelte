<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { createEventDispatcher } from 'svelte';
  import { api } from '$lib/api/client';
  import AttachContentModal from './AttachContentModal.svelte';

  export let campaign: any;

  const dispatch = createEventDispatcher<{ reload: any }>();

  let showAttach = false;
  let detaching: string | null = null;

  const statusBadge: Record<string, string> = {
    DRAFT: 'bg-surface-2 text-ink-muted',
    APPROVED: 'bg-yellow-100 text-yellow-700',
    PUBLISHED: 'bg-green-100 text-green-700',
    ARCHIVED: 'bg-surface-2 text-ink-subtle',
  };

  const statusLabel: Record<string, string> = {
    DRAFT: 'campaigns.detail.statusDraft',
    APPROVED: 'campaigns.detail.statusApproved',
    PUBLISHED: 'campaigns.detail.statusPublished',
    ARCHIVED: 'campaigns.detail.statusArchived',
  };

  function formatDate(d: string): string {
    return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function contentHref(item: any): string {
    return item.projectId
      ? `/projects/${item.projectId}/content/${item.id}/edit`
      : `/content`;
  }

  async function detach(id: string) {
    detaching = id;
    try {
      const updated = await api.patch<any>(`/campaigns/${campaign.id}/detach-content`, {
        contentIds: [id],
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
      {$_('campaigns.detail.contentSection')}
      <span class="ml-1 text-sm font-normal text-ink-muted">({campaign.content?.length ?? 0})</span>
    </h2>
    <button
      on:click={() => (showAttach = true)}
      class="text-xs px-3 py-1.5 bg-brand text-white rounded-lg hover:brightness-110 transition-colors cursor-pointer"
    >
      + {$_('campaigns.detail.attachContent')}
    </button>
  </div>

  {#if !campaign.content || campaign.content.length === 0}
    <p class="text-sm text-ink-muted py-6 text-center">{$_('campaigns.detail.emptyContent')}</p>
  {:else}
    <ul class="divide-y divide-border">
      {#each campaign.content as item}
        <li class="py-3 flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-xs px-2 py-0.5 rounded {statusBadge[item.status] || 'bg-surface-2 text-ink-muted'}">
                {$_(statusLabel[item.status] || 'campaigns.detail.statusDraft')}
              </span>
              {#if item.language}
                <span class="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded">{item.language.toUpperCase()}</span>
              {/if}
              <span class="text-xs text-ink-subtle">{item.type}</span>
              <span class="text-xs text-ink-subtle">· {formatDate(item.updatedAt)}</span>
            </div>
            <a href={contentHref(item)} class="text-sm text-ink hover:text-primary-600 truncate block">
              {item.title}
            </a>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <a
              href={contentHref(item)}
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
  <AttachContentModal
    campaignId={campaign.id}
    on:close={() => (showAttach = false)}
    on:done={onAttached}
  />
{/if}
