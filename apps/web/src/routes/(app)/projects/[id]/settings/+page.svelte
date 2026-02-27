<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  $: projectId = $page.params['id'];
</script>
<div class="p-6">
  <h1 class="text-2xl font-bold text-gray-900 mb-2">PAGE_TITLE</h1>
  <p class="text-gray-500 text-sm">Coming soon — this module is under development.</p>
</div>
