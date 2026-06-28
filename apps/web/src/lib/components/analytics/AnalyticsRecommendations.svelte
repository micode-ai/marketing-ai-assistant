<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  export let projectId: string;

  interface Recommendation {
    id: string;
    title: string;
    why: string;
    how: string;
    priority: 'high' | 'medium' | 'low';
    channel: 'seo' | 'content' | 'social' | 'email' | 'conversion' | 'web' | 'general';
    impact: string;
  }

  let recommendations: Recommendation[] = [];
  let loading = false;
  let error = '';
  let generatedAt: number | null = null;

  const storageKey = () => `analytics_reco_${projectId}`;

  onMount(() => {
    try {
      const cached = localStorage.getItem(storageKey());
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.recommendations && Array.isArray(parsed.recommendations)) {
          recommendations = parsed.recommendations;
          generatedAt = typeof parsed.generatedAt === 'number' ? parsed.generatedAt : null;
        }
      }
    } catch {
      // ignore parse errors
    }
  });

  function sortByPriority(recs: Recommendation[]): Recommendation[] {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...recs].sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
  }

  async function generate() {
    if (loading) return;
    loading = true;
    error = '';
    try {
      const result = await api.post<{ recommendations: Recommendation[] }>(
        `/analytics/recommendations?projectId=${projectId}`,
        { language: $locale || 'en' },
      );
      const recs = sortByPriority(result.recommendations ?? []);
      if (recs.length === 0) {
        // Don't clobber a previously cached good result with an empty response
        // (e.g. agent parse failure); surface a soft error and keep what we had.
        error = $_('analytics.recommendations.error');
      } else {
        recommendations = recs;
        generatedAt = Date.now();
        localStorage.setItem(storageKey(), JSON.stringify({ recommendations, generatedAt }));
      }
    } catch (e: any) {
      error = e?.message || $_('analytics.recommendations.error');
    } finally {
      loading = false;
    }
  }

  function priorityBadgeClass(priority: string): string {
    if (priority === 'high') return 'badge badge-bad';
    if (priority === 'medium') return 'badge badge-warn';
    return 'badge badge-neutral';
  }

  function priorityLabelKey(priority: string): string {
    if (priority === 'high') return 'analytics.recommendations.priorityHigh';
    if (priority === 'medium') return 'analytics.recommendations.priorityMedium';
    return 'analytics.recommendations.priorityLow';
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleString();
  }
</script>

<div class="mt-8">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-lg font-semibold text-ink font-display">{$_('analytics.recommendations.title')}</h2>
    <button class="btn btn-primary" on:click={generate} disabled={loading}>
      {#if loading}
        <span class="w-4 h-4 rounded-full border-2 border-brand-fg/30 border-t-brand-fg animate-spin"></span>
      {/if}
      {recommendations.length === 0
        ? $_('analytics.recommendations.generate')
        : $_('analytics.recommendations.refresh')}
    </button>
  </div>

  {#if loading && recommendations.length === 0}
    <div class="card p-8 flex flex-col items-center justify-center text-center">
      <span class="w-6 h-6 rounded-full border-2 border-border border-t-primary-600 animate-spin mb-3"></span>
      <p class="text-ink-muted text-sm">{$_('analytics.recommendations.loading')}</p>
    </div>
  {:else if error && recommendations.length === 0}
    <div class="card p-6 text-center">
      <p class="text-bad text-sm">{$_('analytics.recommendations.error')}</p>
    </div>
  {:else if recommendations.length === 0}
    <div class="card p-6 text-center">
      <p class="text-ink-muted">{$_('analytics.recommendations.subtitle')}</p>
    </div>
  {:else}
    {#if error}
      <p class="text-bad text-sm mb-3">{$_('analytics.recommendations.error')}</p>
    {/if}
    {#if generatedAt}
      <p class="text-xs text-ink-subtle mb-4">{$_('analytics.recommendations.generatedAt', { values: { date: formatDate(generatedAt) } })}</p>
    {/if}
    <div class="space-y-3">
      {#each recommendations as rec (rec.id)}
        <div class="card p-4">
          <div class="flex items-start gap-2 mb-2 flex-wrap">
            <span class={priorityBadgeClass(rec.priority)}>{$_(priorityLabelKey(rec.priority))}</span>
            <span class="badge badge-brand">{$_('analytics.recommendations.channel.' + rec.channel)}</span>
          </div>
          <h3 class="font-semibold text-ink mb-1">{rec.title}</h3>
          <p class="text-sm text-ink-muted mb-1">
            <span class="font-medium">{$_('analytics.recommendations.why')}</span>
            {rec.why}
          </p>
          <p class="text-sm text-ink mb-1">
            <span class="font-medium">{$_('analytics.recommendations.how')}</span>
            {rec.how}
          </p>
          <p class="text-xs text-ink-subtle">
            <span class="font-medium">{$_('analytics.recommendations.impact')}</span>
            {rec.impact}
          </p>
        </div>
      {/each}
    </div>
  {/if}
</div>
