<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { api } from '$lib/api/client';
  import type { AppReviewDto } from '@marketing-ai/shared-types';

  export let review: AppReviewDto;
  export let projectId: string;

  let replyText = review.replyText || review.aiSuggestedReply || '';
  let generating = false;
  let sending = false;
  let replySent = false;
  let showReplyBox = false;

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  async function generateAiReply() {
    generating = true;
    try {
      const result = await api.post<{ reply: string }>(`/google-play/reviews/${review.reviewId}/ai-reply?projectId=${projectId}`);
      replyText = result.reply;
      showReplyBox = true;
    } catch (e: any) {
      console.error('Failed to generate AI reply:', e);
    } finally {
      generating = false;
    }
  }

  async function sendReply() {
    if (!replyText.trim()) return;
    sending = true;
    try {
      await api.post(`/google-play/reviews/${review.reviewId}/reply?projectId=${projectId}`, { text: replyText.trim() });
      review.replyText = replyText.trim();
      review.isReplied = true;
      replySent = true;
      showReplyBox = false;
      setTimeout(() => { replySent = false; }, 3000);
    } catch (e: any) {
      console.error('Failed to send reply:', e);
    } finally {
      sending = false;
    }
  }
</script>

<div class="bg-white rounded-xl border border-gray-200 p-5">
  <div class="flex items-start justify-between mb-3">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 font-bold text-sm flex-shrink-0">
        {(review.authorName || '?').charAt(0).toUpperCase()}
      </div>
      <div>
        <div class="text-sm font-medium text-gray-900">{review.authorName || $_('googlePlay.reviews.anonymous')}</div>
        <div class="text-xs text-gray-500">{formatDate(review.reviewCreatedAt)}</div>
      </div>
    </div>
    <div class="flex items-center gap-0.5">
      {#each Array(5) as _, i}
        <svg class="w-4 h-4 {i < review.starRating ? 'text-yellow-400' : 'text-gray-200'}" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      {/each}
    </div>
  </div>

  <p class="text-sm text-gray-700 mb-3 whitespace-pre-wrap">{review.text}</p>

  {#if review.metadata}
    {@const meta = review.metadata}
    <div class="flex flex-wrap gap-2 mb-3">
      {#if meta['device']}
        <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{meta['device']}</span>
      {/if}
      {#if meta['appVersionName']}
        <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">v{meta['appVersionName']}</span>
      {/if}
      {#if meta['androidOsVersion']}
        <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Android {meta['androidOsVersion']}</span>
      {/if}
      {#if review.language}
        <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{review.language}</span>
      {/if}
    </div>
  {/if}

  {#if review.isReplied && review.replyText && !showReplyBox}
    <div class="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-3">
      <div class="flex items-center gap-1.5 mb-1">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
        </svg>
        <span class="text-xs font-medium text-gray-500">Developer reply</span>
        {#if review.replyCreatedAt}
          <span class="text-xs text-gray-400">- {formatDate(review.replyCreatedAt)}</span>
        {/if}
      </div>
      <p class="text-sm text-gray-600 whitespace-pre-wrap">{review.replyText}</p>
    </div>
  {/if}

  {#if replySent}
    <div class="flex items-center gap-1.5 text-sm text-green-600">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
      {$_('googlePlay.reviews.replySent')}
    </div>
  {:else}
    <div class="flex items-center gap-2">
      {#if !showReplyBox}
        <button
          on:click={generateAiReply}
          disabled={generating}
          class="px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors duration-150 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
        >
          {#if generating}
            <svg class="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {$_('googlePlay.reviews.generating')}
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            {$_('googlePlay.reviews.aiReply')}
          {/if}
        </button>
        {#if !review.isReplied}
          <button
            on:click={() => { showReplyBox = true; }}
            class="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
          >
            {$_('googlePlay.reviews.editReply')}
          </button>
        {/if}
      {/if}
    </div>

    {#if showReplyBox}
      <div class="mt-3 space-y-2">
        <textarea
          bind:value={replyText}
          rows="3"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
          placeholder="Type your reply..."
        ></textarea>
        <div class="flex items-center gap-2">
          <button
            on:click={sendReply}
            disabled={sending || !replyText.trim()}
            class="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
          >
            {sending ? $_('googlePlay.reviews.sending') : $_('googlePlay.reviews.sendReply')}
          </button>
          <button
            on:click={generateAiReply}
            disabled={generating}
            class="px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors duration-150 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {#if generating}
              <svg class="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {$_('googlePlay.reviews.generating')}
            {:else}
              {$_('googlePlay.reviews.aiReply')}
            {/if}
          </button>
          <button
            on:click={() => { showReplyBox = false; }}
            class="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    {/if}
  {/if}
</div>
