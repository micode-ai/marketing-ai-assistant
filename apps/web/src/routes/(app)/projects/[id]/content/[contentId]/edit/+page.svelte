<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import { api } from '$lib/api/client';
  import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
  import MediaAttachments from '$lib/components/MediaAttachments.svelte';
  import { onMount } from 'svelte';

  $: projectId = $page.params['id'];
  $: contentId = $page.params['contentId'];

  let content: any = null;
  let loading = true;
  let saving = false;
  let imagePrompt = '';
  let generatingImage = false;

  let scheduleEnabled = false;
  let scheduleAt = '';
  let scheduleAccountIds: string[] = [];
  let projectAccounts: any[] = [];
  let pendingPublications: any[] = [];

  async function loadProjectAccounts() {
    if (projectAccounts.length) return;
    try { projectAccounts = await api.get<any[]>('/social/project-accounts', { projectId }); }
    catch { projectAccounts = []; }
  }

  function isoToLocalInput(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  onMount(async () => {
    try {
      content = await api.get<any>(`/content/${contentId}`);
      // MediaAttachments binds straight into this array, so never leave it undefined.
      content.mediaUrls = content.mediaUrls ?? [];
      await loadProjectAccounts();
      if (content?.scheduledAt && content.status !== 'PUBLISHED') {
        scheduleEnabled = true;
        scheduleAt = isoToLocalInput(content.scheduledAt);
        try {
          pendingPublications = await api.get<any[]>('/social/publications', { contentId });
          scheduleAccountIds = pendingPublications.filter(p => p.status === 'PENDING').map(p => p.socialAccountId);
        } catch { /* leave empty */ }
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      loading = false;
    }
  });

  async function save() {
    if (!content) return;
    const isPublished = content.status === 'PUBLISHED';
    if (scheduleEnabled && !isPublished) {
      if (!scheduleAt || scheduleAccountIds.length === 0) { alert($_('content.schedule.noAccountsSelected')); return; }
      if (new Date(scheduleAt).getTime() <= Date.now())   { alert($_('content.schedule.mustBeFuture'));      return; }
    }
    saving = true;
    try {
      const payload: any = {
        title: content.title,
        body: content.body,
        mediaUrls: content.mediaUrls,
      };
      if (!isPublished) {
        payload.scheduleEnabled = scheduleEnabled;
        if (scheduleEnabled) {
          payload.scheduledAt = new Date(scheduleAt).toISOString();
          payload.scheduledPublicationAccountIds = scheduleAccountIds;
        }
      }
      await api.put(`/content/${contentId}`, payload);
      goto(`/projects/${projectId}/content`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      saving = false;
    }
  }

  async function generateImage(prompt: string) {
    generatingImage = true;
    try {
      const data = await api.post<{ url: string; filename: string }>('/uploads/generate-image', { prompt });
      content.mediaUrls = [...(content.mediaUrls || []), data.url];
      content.body += `\n![${prompt}](${data.url})`;
      content = content; // trigger reactivity
      imagePrompt = '';
    } catch (e: any) {
      alert(e.message);
    } finally {
      generatingImage = false;
    }
  }

  /** The editor can embed an attachment in the markdown; drop it when removed. */
  function stripMediaFromBody(url: string) {
    content.body = content.body.replace(new RegExp(`!\\[.*?\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'), '');
    content = content; // trigger reactivity
  }
</script>

{#if loading}
  <div class="flex items-center justify-center h-64">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
  </div>
{:else if content}
  <div class="max-w-screen-2xl mx-auto p-4 sm:p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4 gap-4">
      <input
        type="text"
        bind:value={content.title}
        class="text-2xl font-bold bg-transparent border-none focus:outline-none focus:ring-0 w-full text-ink placeholder-ink-subtle"
        placeholder={$_('content.title')}
      />
      <div class="flex gap-2 flex-shrink-0">
        <button
          on:click={() => goto(`/projects/${projectId}/content`)}
          class="px-4 py-2 text-sm text-ink-muted bg-surface border border-border rounded-lg hover:bg-surface-2 cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
        <button
          on:click={save}
          disabled={saving}
          class="px-4 py-2 text-sm text-white bg-brand rounded-lg hover:brightness-110 disabled:opacity-50 cursor-pointer"
        >
          {saving ? $_('common.saving') : $_('common.save')}
        </button>
      </div>
    </div>

    <!-- Language badge -->
    {#if content.language}
      <div class="mb-3">
        <span class="text-xs px-2 py-0.5 bg-brand-subtle/10 text-brand rounded font-medium uppercase">{content.language}</span>
      </div>
    {/if}

    <!-- Markdown Editor -->
    <MarkdownEditor
      bind:value={content.body}
      on:imageUpload={(e) => { content.mediaUrls = [...(content.mediaUrls || []), e.detail.url]; }}
    />

    <!-- Image generation -->
    <div class="flex gap-2 mt-3">
      <input
        type="text"
        bind:value={imagePrompt}
        placeholder={$_('content.imagePrompt')}
        class="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500"
      />
      <button
        on:click={() => generateImage(imagePrompt)}
        disabled={generatingImage || !imagePrompt}
        class="px-4 py-2 text-sm text-white bg-brand rounded-lg hover:brightness-110 disabled:opacity-50 cursor-pointer whitespace-nowrap"
      >
        {generatingImage ? $_('content.generating_image') : $_('content.generateImage')}
      </button>
    </div>

    <div class="mt-3 space-y-3">
      <MediaAttachments
        bind:urls={content.mediaUrls}
        on:removed={(e) => stripMediaFromBody(e.detail.url)}
      />
    </div>

    <!-- Schedule -->
    {#if content.status !== 'PUBLISHED'}
      <div class="mt-6 border-t pt-4">
        <label class="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" bind:checked={scheduleEnabled} />
          {$_('content.schedule.scheduleForLater')}
        </label>

        {#if scheduleEnabled}
          <div class="mt-3 space-y-3 max-w-2xl">
            <div>
              <label class="block text-xs font-medium text-ink-muted mb-1">{$_('content.schedule.scheduledAt')}</label>
              <input type="datetime-local" bind:value={scheduleAt}
                     class="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>

            <div>
              <label class="block text-xs font-medium text-ink-muted mb-1">{$_('content.schedule.selectAccounts')}</label>
              {#if projectAccounts.length === 0}
                <p class="text-xs text-ink-muted">{$_('content.schedule.noProjectAccounts')}</p>
              {:else}
                <p class="text-xs text-ink-muted mb-1">{$_('content.schedule.languageRoutingHint')}</p>
                <div class="space-y-1 max-h-40 overflow-y-auto border rounded-lg p-2">
                  {#each projectAccounts as acc}
                    <label class="flex items-center gap-2 text-sm">
                      <input type="checkbox" value={acc.id}
                             checked={scheduleAccountIds.includes(acc.id)}
                             on:change={(e) => {
                               if ((e.target as HTMLInputElement).checked) scheduleAccountIds = [...scheduleAccountIds, acc.id];
                               else scheduleAccountIds = scheduleAccountIds.filter(id => id !== acc.id);
                             }} />
                      <span class="font-medium">{acc.platform}</span>
                      <span class="text-ink-muted truncate">{acc.accountName}</span>
                      {#if acc.language}<span class="text-xs px-1.5 py-0.5 bg-surface-2 rounded">{acc.language.toUpperCase()}</span>{/if}
                    </label>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <div class="flex items-center justify-center h-64">
    <p class="text-ink-muted">Content not found</p>
  </div>
{/if}
