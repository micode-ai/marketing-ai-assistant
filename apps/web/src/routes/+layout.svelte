<script lang="ts">
  import '../app.css';
  import { setupI18n } from '$lib/i18n';
  import { waitLocale } from 'svelte-i18n';
  import { onMount } from 'svelte';

  let ready = false;

  onMount(async () => {
    await setupI18n();
    await waitLocale();
    ready = true;
  });
</script>

{#if ready}
  <slot />
{:else}
  <div class="flex items-center justify-center min-h-screen bg-gray-50">
    <div class="flex flex-col items-center gap-4">
      <div class="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-200">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
        </div>
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
    </div>
  </div>
{/if}
