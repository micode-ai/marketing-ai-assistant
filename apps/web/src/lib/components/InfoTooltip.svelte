<script lang="ts">
  import { _ } from 'svelte-i18n';

  export let text = '';
  export let key = '';
  export let side: 'top' | 'bottom' = 'top';

  let open = false;

  $: resolved = key ? $_(key) : text;

  function show() { open = true; }
  function hide() { open = false; }
</script>

<span class="relative inline-flex items-center">
  <button
    type="button"
    aria-label={resolved}
    aria-describedby={open ? 'tooltip-content' : undefined}
    class="w-4 h-4 rounded-full border border-border text-ink-subtle text-[10px] inline-flex items-center justify-center cursor-help hover:text-ink hover:border-brand/40 transition-colors"
    on:mouseenter={show}
    on:mouseleave={hide}
    on:focus={show}
    on:blur={hide}
  >
    ?
  </button>

  {#if open}
    <span
      id="tooltip-content"
      role="tooltip"
      class="absolute z-30 w-52 rounded-lg bg-surface-2 border border-brand/40 text-ink text-xs p-2 shadow-xl pointer-events-none motion-reduce:transition-none transition-opacity duration-150
        {side === 'top'
          ? 'bottom-full mb-1.5 left-1/2 -translate-x-1/2'
          : 'top-full mt-1.5 left-1/2 -translate-x-1/2'}"
    >
      {resolved}
    </span>
  {/if}
</span>
