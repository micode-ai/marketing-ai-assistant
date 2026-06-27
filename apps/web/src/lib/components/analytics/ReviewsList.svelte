<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import type { AppReviewDto } from '@marketing-ai/shared-types';
  import ReviewCard from './ReviewCard.svelte';

  export let projectId: string;

  let reviews: AppReviewDto[] = [];
  let loading = true;
  let currentPage = 1;
  let totalPages = 1;
  let filterRating: number | null = null;
  let filterUnreplied = false;
  let sortBy: 'date' | 'rating' = 'date';

  async function fetchReviews() {
    loading = true;
    try {
      const params: Record<string, string | number> = {
        projectId,
        page: currentPage,
        limit: 10,
        sortBy,
        sortOrder: 'desc',
      };
      if (filterRating !== null) params['starRating'] = filterRating;
      if (filterUnreplied) params['hasReply'] = 0;

      const result = await api.get<{ reviews: AppReviewDto[]; total: number; page: number; totalPages: number }>('/google-play/reviews', params);
      reviews = result.reviews || [];
      totalPages = result.totalPages;
      currentPage = result.page;
    } catch (e) {
      console.error('Failed to load reviews:', e);
      reviews = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchReviews();
  });

  function applyFilter(rating: number | null) {
    filterRating = rating;
    currentPage = 1;
    fetchReviews();
  }

  function toggleUnreplied() {
    filterUnreplied = !filterUnreplied;
    currentPage = 1;
    fetchReviews();
  }

  function changeSort(s: 'date' | 'rating') {
    sortBy = s;
    currentPage = 1;
    fetchReviews();
  }

  function goToPage(page: number) {
    currentPage = page;
    fetchReviews();
  }
</script>

<div>
  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-3 mb-5">
    <div class="flex items-center gap-1.5">
      <span class="text-xs font-medium text-ink-muted">{$_('googlePlay.reviews.filterByRating')}:</span>
      <button
        on:click={() => applyFilter(null)}
        class="px-2.5 py-1 text-xs font-medium rounded-full transition-colors duration-150 cursor-pointer
          {filterRating === null && !filterUnreplied ? 'bg-primary-100 text-brand' : 'bg-surface-2 text-ink-muted hover:bg-gray-200'}"
      >
        {$_('googlePlay.reviews.allRatings')}
      </button>
      {#each [5, 4, 3, 2, 1] as star}
        <button
          on:click={() => applyFilter(star)}
          class="px-2.5 py-1 text-xs font-medium rounded-full transition-colors duration-150 cursor-pointer flex items-center gap-0.5
            {filterRating === star ? 'bg-yellow-100 text-yellow-700' : 'bg-surface-2 text-ink-muted hover:bg-gray-200'}"
        >
          {star}
          <svg class="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      {/each}
    </div>

    <button
      on:click={toggleUnreplied}
      class="px-2.5 py-1 text-xs font-medium rounded-full transition-colors duration-150 cursor-pointer
        {filterUnreplied ? 'bg-orange-100 text-orange-700' : 'bg-surface-2 text-ink-muted hover:bg-gray-200'}"
    >
      {$_('googlePlay.reviews.unreplied')}
    </button>

    <div class="ml-auto flex items-center gap-1.5">
      <span class="text-xs text-ink-muted">Sort:</span>
      <button
        on:click={() => changeSort('date')}
        class="px-2.5 py-1 text-xs font-medium rounded-full transition-colors duration-150 cursor-pointer
          {sortBy === 'date' ? 'bg-primary-100 text-brand' : 'bg-surface-2 text-ink-muted hover:bg-gray-200'}"
      >
        Date
      </button>
      <button
        on:click={() => changeSort('rating')}
        class="px-2.5 py-1 text-xs font-medium rounded-full transition-colors duration-150 cursor-pointer
          {sortBy === 'rating' ? 'bg-primary-100 text-brand' : 'bg-surface-2 text-ink-muted hover:bg-gray-200'}"
      >
        Rating
      </button>
    </div>
  </div>

  <!-- Reviews list -->
  {#if loading}
    <div class="space-y-4">
      {#each Array(3) as _}
        <div class="bg-gray-200 rounded-xl h-40 animate-pulse"></div>
      {/each}
    </div>
  {:else if reviews.length === 0}
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <div class="w-16 h-16 bg-yellow-50 rounded-2xl flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      </div>
      <h2 class="text-lg font-semibold text-ink mb-2">{$_('googlePlay.reviews.noReviews')}</h2>
    </div>
  {:else}
    <div class="space-y-4">
      {#each reviews as review (review.id)}
        <ReviewCard {review} {projectId} />
      {/each}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="flex items-center justify-center gap-2 mt-6">
        <button
          on:click={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          class="px-3 py-1.5 text-sm text-ink-muted border border-border rounded-lg hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          Previous
        </button>
        <span class="text-sm text-ink-muted">
          {currentPage} / {totalPages}
        </span>
        <button
          on:click={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          class="px-3 py-1.5 text-sm text-ink-muted border border-border rounded-lg hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          Next
        </button>
      </div>
    {/if}
  {/if}
</div>
