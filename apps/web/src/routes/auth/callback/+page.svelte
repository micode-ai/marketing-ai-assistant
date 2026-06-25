<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';

  // OAuth (Google) login lands here: the API redirects to
  // `${WEB_URL}/auth/callback?token=...&refresh=...` after a successful sign-in.
  // We persist the tokens (same as email login) and hand off to the app, whose
  // (app) layout loads the user from /users/me once authenticated.
  onMount(() => {
    const token = $page.url.searchParams.get('token');
    const refresh = $page.url.searchParams.get('refresh');
    if (token && refresh) {
      authStore.setTokens(token, refresh);
      goto('/dashboard', { replaceState: true });
    } else {
      goto('/login?error=oauth', { replaceState: true });
    }
  });
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50">
  <div class="flex items-center gap-3 text-gray-500">
    <svg class="animate-spin w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
    <span class="text-sm">Signing you in…</span>
  </div>
</div>
