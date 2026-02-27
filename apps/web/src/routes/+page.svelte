<script lang="ts">
  import { goto } from '$app/navigation';
  import { isAuthenticated } from '$lib/stores/auth';
  import { onMount } from 'svelte';

  onMount(() => {
    if ($isAuthenticated) {
      goto('/dashboard');
    } else {
      goto('/login');
    }
  });
</script>

<div class="flex items-center justify-center min-h-screen">
  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
</div>
