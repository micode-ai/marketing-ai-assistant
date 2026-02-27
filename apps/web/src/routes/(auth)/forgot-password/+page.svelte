<script lang="ts">
  import { _ } from 'svelte-i18n';
  let email = '';
  let sent = false;
  let loading = false;

  async function handleSubmit() {
    loading = true;
    await new Promise(r => setTimeout(r, 1000));
    sent = true;
    loading = false;
  }
</script>

<div class="w-full max-w-md">
  <div class="bg-white rounded-2xl shadow-xl p-8">
    <div class="text-center mb-8">
      <div class="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">M</div>
      <h1 class="text-2xl font-bold text-gray-900">{$_('auth.resetPassword')}</h1>
    </div>
    {#if sent}
      <div class="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 text-center">
        <p class="font-medium">{$_('auth.verifyEmail')}</p>
        <p class="text-sm mt-1">{$_('auth.verifyEmailDesc', { values: { email } })}</p>
      </div>
    {:else}
      <form on:submit|preventDefault={handleSubmit} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{$_('auth.email')}</label>
          <input type="email" bind:value={email} required class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
        </div>
        <button type="submit" disabled={loading} class="w-full bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50 text-sm">
          {loading ? $_('common.loading') : $_('auth.sendResetEmail')}
        </button>
      </form>
    {/if}
    <p class="text-center text-sm text-gray-500 mt-6">
      <a href="/login" class="text-primary-600 hover:underline">{$_('auth.backToLogin')}</a>
    </p>
  </div>
</div>
