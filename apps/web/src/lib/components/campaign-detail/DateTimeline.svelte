<script lang="ts">
  import { _ } from 'svelte-i18n';

  export let startDate: string | null = null;
  export let endDate: string | null = null;

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  $: visible = !!(startDate || endDate);
  $: start = startDate ? new Date(startDate) : null;
  $: end = endDate ? new Date(endDate) : null;
  $: today = new Date();

  $: state = (() => {
    if (!start || !end) return 'partial' as const;
    if (today < start) return 'notStarted' as const;
    if (today > end) return 'completed' as const;
    return 'inRange' as const;
  })();

  $: percent = state === 'inRange' && start && end
    ? Math.min(100, Math.max(0, ((today.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100))
    : state === 'completed' ? 100 : 0;

  $: totalDays = start && end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000)) : 0;
  $: currentDay = state === 'inRange' && start
    ? Math.max(1, Math.ceil((today.getTime() - start.getTime()) / 86_400_000))
    : 0;
  $: daysLeft = state === 'inRange' && end
    ? Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86_400_000))
    : 0;
</script>

{#if visible}
  <div class="bg-surface rounded-xl border border-border p-5">
    <div class="flex items-center justify-between text-xs text-ink-muted mb-2">
      <span>{startDate ? formatDate(startDate) : '—'}</span>
      {#if state === 'notStarted'}
        <span class="font-medium text-ink-muted">{$_('campaigns.detail.notStarted')}</span>
      {:else if state === 'completed'}
        <span class="font-medium text-blue-600">{$_('campaigns.detail.completed')}</span>
      {:else if state === 'inRange'}
        <span class="font-medium text-brand">
          {$_('campaigns.detail.dayXofY', { values: { current: currentDay, total: totalDays } })}
          · {$_('campaigns.detail.daysLeft', { values: { days: daysLeft } })}
        </span>
      {/if}
      <span>{endDate ? formatDate(endDate) : '—'}</span>
    </div>
    <div class="relative h-2 bg-surface-2 rounded-full overflow-hidden">
      <div
        class="absolute inset-y-0 left-0 bg-brand transition-all"
        style="width: {percent}%"
      ></div>
      {#if state === 'inRange'}
        <div
          class="absolute top-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full bg-surface border-2 border-brand/40 shadow"
          style="left: {percent}%"
        ></div>
      {/if}
    </div>
  </div>
{/if}
