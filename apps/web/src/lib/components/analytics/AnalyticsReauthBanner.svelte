<script lang="ts">
  import { _ } from 'svelte-i18n';

  /** Channel name shown in the title, e.g. "Threads". */
  export let channel: string;
</script>

<!-- Shown above a channel dashboard whose token needs reauthentication: the
     history below is real but has stopped growing, and without this the tab
     just looks like a quiet period. -->
<div class="bg-amber-500/12 border border-amber-500/30 rounded-xl p-4 mb-4 flex items-start gap-3" role="alert">
  <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
  </svg>
  <div class="flex-1">
    <h3 class="text-sm font-semibold text-amber-900">{$_('analytics.reauth.title', { values: { channel } })}</h3>
    <p class="text-sm text-amber-700 mt-0.5">{$_('analytics.reauth.description')}</p>
    <a href="/settings/integrations"
       class="inline-flex items-center gap-1 mt-2 text-sm font-medium text-amber-800 hover:text-amber-900 hover:underline">
      {$_('analytics.reauth.cta')} →
    </a>
  </div>
</div>
