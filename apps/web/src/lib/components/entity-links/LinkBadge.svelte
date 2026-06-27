<script lang="ts">
  import { _ } from 'svelte-i18n';

  export let linkType: 'COPY' | 'LINK';
  export let targetScope: string;
</script>

<span class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full
  {linkType === 'LINK' ? 'bg-green-500/20 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-surface-2 text-ink-muted'}"
  title={linkType === 'LINK' ? $_('entityLinks.linkedTooltip') : $_('entityLinks.copiedTooltip')}>
  {#if linkType === 'LINK'}
    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
    </svg>
  {/if}
  {targetScope === 'ORGANIZATION' ? $_('entityLinks.org') : $_('entityLinks.project')}
</span>
