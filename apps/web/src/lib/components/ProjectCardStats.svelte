<script lang="ts">
  import { _ } from 'svelte-i18n';

  export let stats: { content: number; emailsSent: number; pageViews: number; conversions: number } | undefined = undefined;
  export let period: number;
  export let loading = false;

  function formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }

  $: hasAnyActivity = stats && (stats.pageViews + stats.emailsSent + stats.conversions + stats.content > 0);
</script>

<div class="border-t border-border pt-3 mt-3">
  <p class="text-[11px] uppercase tracking-wide text-ink-subtle mb-2">
    {$_('dashboard.lastNDays').replace('{n}', String(period))}
  </p>
  {#if loading}
    <div class="grid grid-cols-4 gap-2">
      {#each [0, 1, 2, 3] as _i}
        <div class="h-5 bg-surface-2 rounded animate-pulse"></div>
      {/each}
    </div>
  {:else if !stats || !hasAnyActivity}
    <p class="text-xs text-ink-subtle">{$_('dashboard.noActivity')}</p>
  {:else}
    <div class="grid grid-cols-4 gap-2 text-xs">
      <div class="flex flex-col items-start">
        <span class="flex items-center gap-1 text-ink-muted" title={$_('analytics.pageViews')}>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        </span>
        <span class="text-ink font-semibold mt-0.5">{formatNumber(stats.pageViews)}</span>
      </div>
      <div class="flex flex-col items-start">
        <span class="flex items-center gap-1 text-ink-muted" title={$_('analytics.emailOpens')}>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
        </span>
        <span class="text-ink font-semibold mt-0.5">{formatNumber(stats.emailsSent)}</span>
      </div>
      <div class="flex flex-col items-start">
        <span class="flex items-center gap-1 text-ink-muted" title={$_('analytics.conversions')}>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </span>
        <span class="text-ink font-semibold mt-0.5">{formatNumber(stats.conversions)}</span>
      </div>
      <div class="flex flex-col items-start">
        <span class="flex items-center gap-1 text-ink-muted" title={$_('content.content')}>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
        </span>
        <span class="text-ink font-semibold mt-0.5">{formatNumber(stats.content)}</span>
      </div>
    </div>
  {/if}
</div>
