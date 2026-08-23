<script lang="ts">
  /**
   * Media attached to a piece of content: the thumbnails, a video picker and a
   * paste-a-URL field. Lives in one component because the same block is needed
   * when creating content, when editing it in the modal, and on the standalone
   * edit page — it previously existed only in the modal, and image-only.
   */
  import { _ } from 'svelte-i18n';
  import { createEventDispatcher } from 'svelte';
  import { api } from '$lib/api/client';

  /** Bound both ways: the component adds and removes entries itself. */
  export let urls: string[] = [];

  // Hosts that embed media in the markdown body listen for this to strip it.
  const dispatch = createEventDispatcher<{ removed: { url: string } }>();

  const VIDEO_RE = /\.(mp4|mov|m4v|webm)(\?.*)?$/i;
  export function isVideoUrl(url: string): boolean {
    return VIDEO_RE.test(url);
  }

  let uploadingVideo = false;
  let mediaUrlInput = '';
  let error = '';

  // TikTok has no text-only post type, so a video is what makes a post
  // publishable there at all.
  async function uploadVideo(event: Event) {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.[0];
    if (!chosen) return;
    uploadingVideo = true;
    error = '';
    try {
      const body = new FormData();
      body.append('file', chosen);
      const data = await api.upload<{ url: string; filename: string }>('/uploads/video', body);
      urls = [...urls, data.url];
    } catch (e: any) {
      error = e.message;
    } finally {
      uploadingVideo = false;
      input.value = '';
    }
  }

  /** Escape hatch for media that already lives elsewhere (a CDN, for instance). */
  function attachMediaUrl() {
    const url = mediaUrlInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      error = $_('content.mediaUrlInvalid');
      return;
    }
    urls = [...urls, url];
    mediaUrlInput = '';
    error = '';
  }

  function remove(index: number) {
    const url = urls[index];
    urls = urls.filter((_item, i) => i !== index);
    dispatch('removed', { url });
  }
</script>

{#if urls.length > 0}
  <div>
    <label class="block text-sm font-medium text-ink mb-1.5">{$_('content.attachedMedia')}</label>
    <div class="flex flex-wrap gap-2">
      {#each urls as url, i}
        <div class="relative group w-20 h-20 rounded-lg overflow-hidden border border-border bg-surface-2">
          {#if isVideoUrl(url)}
            <!-- svelte-ignore a11y-media-has-caption -->
            <video src={url} class="w-full h-full object-cover" muted preload="metadata"></video>
            <span class="absolute bottom-0.5 left-0.5 px-1 rounded bg-black/60 text-white text-[10px]">MP4</span>
          {:else}
            <img src={url} alt="Attached" class="w-full h-full object-cover" />
          {/if}
          <button
            on:click={() => remove(i)}
            class="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs"
            aria-label="Remove"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
  <div>
    <label class="block text-sm font-medium text-ink mb-1.5">{$_('content.attachVideo')}</label>
    <input
      type="file"
      accept="video/mp4,video/quicktime,video/webm"
      on:change={uploadVideo}
      disabled={uploadingVideo}
      class="w-full text-sm text-ink-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-surface-2 file:text-ink hover:file:bg-surface cursor-pointer disabled:opacity-50"
    />
    <p class="text-xs text-ink-subtle mt-1">
      {uploadingVideo ? $_('content.uploadingVideo') : $_('content.attachVideoHint')}
    </p>
  </div>
  <div>
    <label class="block text-sm font-medium text-ink mb-1.5">{$_('content.mediaUrl')}</label>
    <div class="flex gap-2">
      <input
        type="url"
        bind:value={mediaUrlInput}
        on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); attachMediaUrl(); } }}
        placeholder="https://…"
        class="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
      <button
        on:click={attachMediaUrl}
        class="px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-surface-2 cursor-pointer whitespace-nowrap"
      >
        {$_('content.mediaUrlAdd')}
      </button>
    </div>
    <p class="text-xs text-ink-subtle mt-1">{$_('content.mediaUrlHint')}</p>
  </div>
</div>

{#if error}
  <p class="text-sm text-red-600">{error}</p>
{/if}
