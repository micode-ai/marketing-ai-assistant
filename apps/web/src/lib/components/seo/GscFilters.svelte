<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  export let days: number = 28;
  export let compare: boolean = true;
  export let searchType: 'web' | 'image' | 'video' | 'news' | 'discover' = 'web';
  export let filters: Array<{ dimension: string; operator: string; expression: string }> = [];
  export let brandTerm: string = '';

  const dispatch = createEventDispatcher<{ apply: void }>();

  // Local filter state (draft, applied on click)
  let queryContains = '';
  let country = '';
  let device: 'ALL' | 'DESKTOP' | 'MOBILE' | 'TABLET' = 'ALL';
  let brandMode: 'none' | 'brand' | 'nonbrand' = 'none';

  // Initialise local state from current filters when component mounts
  function parseFiltersToLocal() {
    queryContains = '';
    country = '';
    device = 'ALL';
    brandMode = 'none';
    for (const f of filters) {
      if (f.dimension === 'country' && f.operator === 'equals') {
        country = f.expression;
      } else if (f.dimension === 'device' && f.operator === 'equals') {
        device = f.expression as typeof device;
      } else if (f.dimension === 'query') {
        if (f.operator === 'contains' && brandTerm && f.expression === brandTerm) {
          brandMode = 'brand';
        } else if (f.operator === 'notContains' && brandTerm && f.expression === brandTerm) {
          brandMode = 'nonbrand';
        } else if (f.operator === 'contains') {
          queryContains = f.expression;
        }
      }
    }
  }

  // Build and apply filters
  function applyFilters() {
    const built: Array<{ dimension: string; operator: string; expression: string }> = [];

    if (queryContains.trim()) {
      built.push({ dimension: 'query', operator: 'contains', expression: queryContains.trim() });
    }
    if (country.trim()) {
      built.push({ dimension: 'country', operator: 'equals', expression: country.trim().toLowerCase() });
    }
    if (device !== 'ALL') {
      built.push({ dimension: 'device', operator: 'equals', expression: device });
    }
    if (brandMode === 'brand' && brandTerm) {
      built.push({ dimension: 'query', operator: 'contains', expression: brandTerm });
    } else if (brandMode === 'nonbrand' && brandTerm) {
      built.push({ dimension: 'query', operator: 'notContains', expression: brandTerm });
    }

    filters = built;
    dispatch('apply');
  }

  function onDaysChange(d: number) {
    days = d;
    dispatch('apply');
  }

  function onCompareChange(e: Event) {
    compare = (e.target as HTMLInputElement).checked;
    dispatch('apply');
  }

  $: parseFiltersToLocal(), filters;
</script>

<div class="bg-surface rounded-xl border border-border p-4 mb-5 space-y-4">
  <!-- Row 1: Period + Compare + Search type -->
  <div class="flex flex-wrap items-center gap-4">
    <!-- Period selector -->
    <div class="flex items-center gap-1 bg-surface-2 rounded-lg p-1">
      {#each [7, 28, 90] as d}
        <button
          type="button"
          on:click={() => onDaysChange(d)}
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-150
            {days === d
              ? 'bg-surface text-ink shadow-sm'
              : 'text-ink-muted hover:text-ink'}">
          {d}d
        </button>
      {/each}
    </div>

    <!-- Compare toggle -->
    <label class="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={compare}
        on:change={onCompareChange}
        class="h-4 w-4 rounded border-border text-brand focus:ring-primary-500" />
      <span class="text-sm text-ink">{$_('gscDetail.compare')}</span>
    </label>

    <!-- Search type -->
    <div class="flex items-center gap-2">
      <label class="text-sm text-ink-muted whitespace-nowrap">{$_('gscDetail.searchType')}:</label>
      <select
        bind:value={searchType}
        class="text-sm border border-border rounded-lg px-2.5 py-1.5 bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
        <option value="web">Web</option>
        <option value="image">Image</option>
        <option value="video">Video</option>
        <option value="news">News</option>
        <option value="discover">Discover</option>
      </select>
    </div>
  </div>

  <!-- Row 2: Filter inputs -->
  <div class="border-t border-border pt-3">
    <span class="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2 block">{$_('gscDetail.filters')}</span>
    <div class="flex flex-wrap items-end gap-3">
      <!-- Query contains -->
      <div class="flex flex-col gap-1 min-w-[160px]">
        <label class="text-xs text-ink-muted">{$_('gscDetail.queryContains')}</label>
        <input
          type="text"
          bind:value={queryContains}
          placeholder="e.g. marketing"
          class="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface text-ink placeholder-ink-subtle focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
      </div>

      <!-- Country -->
      <div class="flex flex-col gap-1 min-w-[120px]">
        <label class="text-xs text-ink-muted">{$_('gscDetail.country')}</label>
        <input
          type="text"
          bind:value={country}
          placeholder="usa"
          maxlength={3}
          class="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface text-ink placeholder-ink-subtle focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent uppercase" />
      </div>

      <!-- Device -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-ink-muted">{$_('gscDetail.device')}</label>
        <select
          bind:value={device}
          class="text-sm border border-border rounded-lg px-2.5 py-1.5 bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
          <option value="ALL">All devices</option>
          <option value="DESKTOP">Desktop</option>
          <option value="MOBILE">Mobile</option>
          <option value="TABLET">Tablet</option>
        </select>
      </div>

      <!-- Brand mode -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-ink-muted">{$_('gscDetail.filters')}</label>
        <select
          bind:value={brandMode}
          class="text-sm border border-border rounded-lg px-2.5 py-1.5 bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
          <option value="none">All queries</option>
          <option value="brand">{$_('gscDetail.brandOnly')}</option>
          <option value="nonbrand">{$_('gscDetail.nonBrandOnly')}</option>
        </select>
      </div>

      <!-- Brand term (shown when brand/nonbrand selected) -->
      {#if brandMode !== 'none'}
        <div class="flex flex-col gap-1 min-w-[140px]">
          <label class="text-xs text-ink-muted">{$_('gscDetail.brandTerm')}</label>
          <input
            type="text"
            bind:value={brandTerm}
            placeholder="your brand"
            class="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface text-ink placeholder-ink-subtle focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
      {/if}

      <!-- Apply button -->
      <button
        type="button"
        on:click={applyFilters}
        class="px-4 py-1.5 text-sm font-medium bg-brand hover:brightness-110 text-white rounded-lg transition-colors self-end">
        Apply
      </button>
    </div>
  </div>
</div>
