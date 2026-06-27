<script lang="ts">
  import { browser } from '$app/environment';
  import { _ } from 'svelte-i18n';

  export let sectionKey: string;
  export let titleKey: string;
  export let descKey: string;

  let dismissed = browser
    ? localStorage.getItem(`hint_dismissed_${sectionKey}`) === 'true'
    : false;

  function dismiss() {
    dismissed = true;
    if (browser) localStorage.setItem(`hint_dismissed_${sectionKey}`, 'true');
  }
</script>

{#if !dismissed}
  <div class="bg-blue-500/12 border border-blue-500/20 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
    <div class="text-blue-500 flex-shrink-0 mt-0.5">
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-semibold text-blue-900">{$_(titleKey)}</p>
      <p class="text-xs text-blue-700 mt-0.5 leading-relaxed">{$_(descKey)}</p>
    </div>
    <button
      on:click={dismiss}
      class="text-blue-400 hover:text-blue-600 flex-shrink-0 cursor-pointer transition-colors duration-150"
      aria-label="Dismiss"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
{/if}
