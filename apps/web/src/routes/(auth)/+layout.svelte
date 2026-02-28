<script lang="ts">
  import { isAuthenticated } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    if ($isAuthenticated) goto('/dashboard');
  });
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-primary-900 to-violet-950 flex items-center justify-center p-4 relative overflow-hidden">
  <!-- Subtle dot-grid pattern for depth -->
  <div class="auth-dot-grid absolute inset-0 opacity-[0.04] pointer-events-none"></div>

  <!-- Decorative blurred blobs for ambient glow -->
  <div class="absolute top-1/4 left-1/4 w-80 h-80 bg-primary-600 rounded-full filter blur-[120px] opacity-20 pointer-events-none"></div>
  <div class="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-600 rounded-full filter blur-[120px] opacity-20 pointer-events-none"></div>

  <!-- Content above decorative elements -->
  <div class="relative z-10 w-full flex items-center justify-center">
    <slot />
  </div>
</div>

<style>
  .auth-dot-grid {
    background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'%3E%3Ccircle cx='4' cy='4' r='1.5'/%3E%3C/g%3E%3C/svg%3E");
  }
</style>
