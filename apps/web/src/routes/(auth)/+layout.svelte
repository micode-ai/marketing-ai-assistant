<script lang="ts">
  import { isAuthenticated } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    if ($isAuthenticated) goto('/dashboard');
  });
</script>

<div class="min-h-screen bg-gradient-to-br from-primary-50 via-violet-50 to-purple-100 flex items-center justify-center p-4">
  <slot />
</div>
