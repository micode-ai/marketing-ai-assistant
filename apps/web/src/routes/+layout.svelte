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
      <div class="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl">M</div>
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
    </div>
  </div>
{/if}
