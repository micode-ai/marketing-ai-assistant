<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore } from '$lib/stores/projects';

  $: projectId = $page.params['id'];

  const currencies = ['USD', 'EUR', 'GBP', 'PLN', 'RUB', 'UAH', 'BYN', 'KZT', 'TRY', 'JPY', 'CNY'];
  let baseCurrency = 'USD';
  let currencySaved = false;

  let allAccounts: any[] = [];
  let enabledIds: Set<string> = new Set();
  let loading = true;
  let saving = false;
  let saved = false;

  let trackingInfo: { trackingId: string; snippetUrl: string } | null = null;
  let snippetCopied = false;

  const platformIcon: Record<string, string> = {
    LINKEDIN: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
    TWITTER: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    FACEBOOK: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
    TELEGRAM: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
  };

  const platformColor: Record<string, string> = {
    LINKEDIN: 'text-[#0077B5] bg-[#0077B5]/10',
    TWITTER: 'text-gray-900 bg-gray-100',
    FACEBOOK: 'text-[#1877F2] bg-[#1877F2]/10',
    TELEGRAM: 'text-[#26A5E4] bg-[#26A5E4]/10',
  };

  onMount(async () => {
    if (!$organizationIdStore) { loading = false; return; }
    try {
      const [all, enabled, tracking, project] = await Promise.all([
        api.get<any[]>('/social/accounts', { organizationId: $organizationIdStore }),
        api.get<any[]>('/social/project-accounts', { projectId }),
        api.get<{ trackingId: string; snippetUrl: string }>(`/projects/${projectId}/tracking`),
        api.get<any>(`/projects/${projectId}`),
      ]);
      allAccounts = all;
      enabledIds = new Set(enabled.map((a: any) => a.id));
      trackingInfo = tracking;
      if (project.baseCurrency) baseCurrency = project.baseCurrency;
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });

  async function saveBaseCurrency() {
    try {
      await api.put(`/projects/${projectId}`, { baseCurrency });
      currencySaved = true;
      setTimeout(() => { currencySaved = false; }, 2500);
    } catch (e: any) {
      console.error(e);
    }
  }

  function toggle(id: string) {
    const next = new Set(enabledIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    enabledIds = next;
  }

  async function copySnippet() {
    if (!trackingInfo) return;
    try {
      const res = await fetch(trackingInfo.snippetUrl);
      const fullSnippet = await res.text();
      await navigator.clipboard.writeText(fullSnippet);
      snippetCopied = true;
      setTimeout(() => { snippetCopied = false; }, 2500);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  }

  async function save() {
    saving = true;
    saved = false;
    try {
      await api.put('/social/project-accounts', {
        projectId,
        socialAccountIds: [...enabledIds],
      });
      saved = true;
      setTimeout(() => { saved = false; }, 2500);
    } catch (e: any) {
      alert(e.message);
    } finally {
      saving = false;
    }
  }
</script>

<div class="p-6 max-w-2xl">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">{$_('projects.settings')}</h1>
  </div>

  <!-- Base Currency section -->
  <div class="bg-white rounded-xl border border-gray-200 p-5 mb-6">
    <div class="mb-4">
      <h2 class="text-base font-semibold text-gray-900">{$_('projects.baseCurrency')}</h2>
    </div>
    <select
      bind:value={baseCurrency}
      on:change={saveBaseCurrency}
      class="w-full max-w-xs px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      {#each currencies as c}
        <option value={c}>{c}</option>
      {/each}
    </select>
    <p class="text-sm text-gray-500 mt-2">{$_('projects.baseCurrencyWarning')}</p>
    {#if currencySaved}
      <span class="text-sm text-green-600 flex items-center gap-1 mt-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        {$_('common.saved')}
      </span>
    {/if}
  </div>

  <!-- Social Networks section -->
  <div class="bg-white rounded-xl border border-gray-200 p-5">
    <div class="mb-4">
      <h2 class="text-base font-semibold text-gray-900">{$_('projects.socialNetworks')}</h2>
      <p class="text-sm text-gray-500 mt-0.5">{$_('projects.socialNetworksDesc')}</p>
    </div>

    {#if loading}
      <div class="space-y-2">
        {#each Array(3) as _}
          <div class="h-12 bg-gray-100 rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else if allAccounts.length === 0}
      <div class="text-center py-8 text-gray-500">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </svg>
        <p class="text-sm font-medium text-gray-600 mb-1">{$_('projects.noOrgAccounts')}</p>
        <a href="/settings/integrations" class="text-sm text-primary-600 hover:underline">{$_('projects.noOrgAccountsLink')}</a>
      </div>
    {:else}
      <div class="space-y-2 mb-4">
        {#each allAccounts as account}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors duration-150 {enabledIds.has(account.id) ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}"
            on:click={() => toggle(account.id)}
          >
            <input
              type="checkbox"
              checked={enabledIds.has(account.id)}
              class="w-4 h-4 text-primary-600 rounded border-gray-300 cursor-pointer flex-shrink-0"
              readonly
            />
            <div class="w-8 h-8 rounded-lg {platformColor[account.platform] || 'bg-gray-100 text-gray-500'} flex items-center justify-center flex-shrink-0">
              {@html platformIcon[account.platform] || ''}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900">{account.accountName}</div>
              <div class="text-xs text-gray-500">{account.platform}</div>
            </div>
            {#if enabledIds.has(account.id)}
              <span class="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full flex-shrink-0">{$_('social.connected')}</span>
            {/if}
          </div>
        {/each}
      </div>

      <div class="flex items-center gap-3">
        <button
          on:click={save}
          disabled={saving}
          class="px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
        >
          {saving ? $_('common.loading') : $_('common.save')}
        </button>
        {#if saved}
          <span class="text-sm text-green-600 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            {$_('projects.socialAccountsSaved')}
          </span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Website Tracking section -->
  <div class="bg-white rounded-xl border border-gray-200 p-5 mt-6">
    <div class="mb-4">
      <h2 class="text-base font-semibold text-gray-900">{$_('tracking.title')}</h2>
      <p class="text-sm text-gray-500 mt-0.5">{$_('tracking.description')}</p>
    </div>

    {#if trackingInfo}
      <div class="mb-4">
        <label class="block text-xs font-medium text-gray-600 mb-1">{$_('tracking.trackingId')}</label>
        <code class="text-sm bg-gray-50 px-3 py-1.5 rounded border border-gray-200 font-mono inline-block">{trackingInfo.trackingId}</code>
      </div>

      <div class="mb-4">
        <label class="block text-xs font-medium text-gray-600 mb-1">{$_('tracking.snippet')}</label>
        <pre class="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto max-h-48 whitespace-pre-wrap">&lt;!-- Marketing AI Tracking --&gt;
&lt;script src="{trackingInfo.snippetUrl}"&gt;&lt;/script&gt;</pre>
      </div>

      <div class="flex items-center gap-3 mb-5">
        <button
          on:click={copySnippet}
          class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors duration-150 cursor-pointer flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {snippetCopied ? $_('common.copied') : $_('tracking.copySnippet')}
        </button>
        <p class="text-xs text-gray-500">{$_('tracking.copyHint')}</p>
      </div>

      <div class="border-t border-gray-100 pt-4 space-y-3">
        <div>
          <h3 class="text-xs font-semibold text-gray-700">{$_('tracking.customEvents')}</h3>
          <code class="text-xs text-gray-500 font-mono">mktai('event', 'button_click', &#123;label: 'signup'&#125;)</code>
        </div>
        <div>
          <h3 class="text-xs font-semibold text-gray-700">{$_('tracking.conversions')}</h3>
          <code class="text-xs text-gray-500 font-mono">mktai('conversion', 'purchase', &#123;value: 99&#125;)</code>
        </div>
      </div>
    {:else if !loading}
      <div class="text-sm text-gray-500">{$_('common.loading')}</div>
    {/if}
  </div>
</div>
