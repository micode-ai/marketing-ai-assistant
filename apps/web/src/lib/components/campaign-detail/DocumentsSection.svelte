<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { createEventDispatcher } from 'svelte';
  import { api } from '$lib/api/client';
  import { API_URL } from '$lib/config';
  import AttachDocumentsModal from './AttachDocumentsModal.svelte';

  export let campaign: any;

  const dispatch = createEventDispatcher<{ reload: any }>();

  let showAttach = false;
  let detaching: string | null = null;

  function formatFileSize(bytes?: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function documentHref(item: any): string {
    return item.projectId
      ? `/projects/${item.projectId}/documents`
      : `/documents`;
  }

  function downloadUrl(item: any): string | null {
    if (!item.fileUrl) return null;
    return `${API_URL.replace('/api', '')}${item.fileUrl}`;
  }

  async function detach(id: string) {
    detaching = id;
    try {
      const updated = await api.patch<any>(`/campaigns/${campaign.id}/detach-documents`, {
        documentIds: [id],
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
      {$_('campaigns.detail.documentsSection')}
      <span class="ml-1 text-sm font-normal text-ink-muted">({campaign.documents?.length ?? 0})</span>
    </h2>
    <button
      on:click={() => (showAttach = true)}
      class="text-xs px-3 py-1.5 bg-brand text-white rounded-lg hover:brightness-110 transition-colors cursor-pointer"
    >
      + {$_('campaigns.detail.attachDocuments')}
    </button>
  </div>

  {#if !campaign.documents || campaign.documents.length === 0}
    <p class="text-sm text-ink-muted py-6 text-center">{$_('campaigns.detail.emptyDocuments')}</p>
  {:else}
    <ul class="divide-y divide-border">
      {#each campaign.documents as item}
        <li class="py-3 flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-xs px-2 py-0.5 rounded bg-surface-2 text-ink-muted font-medium">
                {item.type || ''}
              </span>
              {#if item.generatedByAi}
                <span class="text-xs px-1.5 py-0.5 bg-purple-500/12 text-purple-600 rounded">AI</span>
              {/if}
              {#if item.fileUrl}
                <span class="text-xs text-ink-subtle">{item.fileName || ''}</span>
                {#if item.fileSize}
                  <span class="text-xs text-ink-subtle">· {formatFileSize(item.fileSize)}</span>
                {/if}
              {/if}
            </div>
            <a href={documentHref(item)} class="text-sm text-ink hover:text-primary-600 truncate block">
              {item.title}
            </a>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            {#if downloadUrl(item)}
              <a
                href={downloadUrl(item)}
                download={item.fileName || item.title}
                class="text-xs px-2 py-1 text-ink-muted hover:text-ink hover:bg-surface-2 rounded cursor-pointer"
              >
                {$_('documents.download')}
              </a>
            {/if}
            <a
              href={documentHref(item)}
              class="text-xs px-2 py-1 text-ink-muted hover:text-ink hover:bg-surface-2 rounded cursor-pointer"
            >
              {$_('campaigns.detail.open')}
            </a>
            <button
              on:click={() => detach(item.id)}
              disabled={detaching === item.id}
              class="text-xs px-2 py-1 text-red-500 hover:bg-red-500/12 rounded cursor-pointer disabled:opacity-50"
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
  <AttachDocumentsModal
    campaignId={campaign.id}
    on:close={() => (showAttach = false)}
    on:done={onAttached}
  />
{/if}
