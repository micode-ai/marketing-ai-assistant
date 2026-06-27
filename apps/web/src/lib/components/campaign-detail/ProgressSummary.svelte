<script lang="ts">
  import { _ } from 'svelte-i18n';

  export let progress: {
    content: { total: number; byStatus: Record<string, number> };
    email:   { total: number; byStatus: Record<string, number> };
  };

  const contentColors: Record<string, string> = {
    DRAFT: 'bg-gray-300',
    APPROVED: 'bg-yellow-400',
    PUBLISHED: 'bg-green-500',
    ARCHIVED: 'bg-gray-200',
  };
  const contentStatuses = ['DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED'] as const;

  const emailColors: Record<string, string> = {
    draft: 'bg-gray-300',
    scheduled: 'bg-yellow-400',
    sent: 'bg-green-500',
  };
  const emailStatuses = ['draft', 'scheduled', 'sent'] as const;

  $: contentPublished = progress.content.byStatus['PUBLISHED'] ?? 0;
  $: emailSent = progress.email.byStatus['sent'] ?? 0;
</script>

<div class="bg-surface rounded-xl border border-border p-5 space-y-4">
  <div>
    <div class="flex items-center justify-between text-sm mb-1.5">
      <span class="font-medium text-ink">{$_('campaigns.detail.contentProgress')}</span>
      <span class="text-xs text-ink-muted">
        {$_('campaigns.detail.publishedOfTotal', { values: { published: contentPublished, total: progress.content.total } })}
      </span>
    </div>
    {#if progress.content.total > 0}
      <div class="flex h-2 rounded-full overflow-hidden bg-surface-2">
        {#each contentStatuses as s}
          {@const count = progress.content.byStatus[s] ?? 0}
          {#if count > 0}
            <div
              class="{contentColors[s]} transition-all"
              style="width: {(count / progress.content.total) * 100}%"
              title="{$_('campaigns.detail.status' + s.charAt(0) + s.slice(1).toLowerCase())}: {count}"
            ></div>
          {/if}
        {/each}
      </div>
    {:else}
      <div class="h-2 rounded-full bg-surface-2"></div>
    {/if}
    <div class="flex flex-wrap gap-3 mt-2 text-xs text-ink-muted">
      {#each contentStatuses as s}
        <span class="inline-flex items-center gap-1">
          <span class="w-2 h-2 rounded-sm {contentColors[s]}"></span>
          {$_('campaigns.detail.status' + s.charAt(0) + s.slice(1).toLowerCase())}: {progress.content.byStatus[s] ?? 0}
        </span>
      {/each}
    </div>
  </div>

  {#if progress.email.total > 0}
    <div>
      <div class="flex items-center justify-between text-sm mb-1.5">
        <span class="font-medium text-ink">{$_('campaigns.detail.emailProgress')}</span>
        <span class="text-xs text-ink-muted">
          {$_('campaigns.detail.sentOfTotal', { values: { sent: emailSent, total: progress.email.total } })}
        </span>
      </div>
      <div class="flex h-2 rounded-full overflow-hidden bg-surface-2">
        {#each emailStatuses as s}
          {@const count = progress.email.byStatus[s] ?? 0}
          {#if count > 0}
            <div
              class="{emailColors[s]} transition-all"
              style="width: {(count / progress.email.total) * 100}%"
              title="{$_('campaigns.detail.status' + s.charAt(0).toUpperCase() + s.slice(1))}: {count}"
            ></div>
          {/if}
        {/each}
      </div>
      <div class="flex flex-wrap gap-3 mt-2 text-xs text-ink-muted">
        {#each emailStatuses as s}
          <span class="inline-flex items-center gap-1">
            <span class="w-2 h-2 rounded-sm {emailColors[s]}"></span>
            {$_('campaigns.detail.status' + s.charAt(0).toUpperCase() + s.slice(1))}: {progress.email.byStatus[s] ?? 0}
          </span>
        {/each}
      </div>
    </div>
  {/if}
</div>
