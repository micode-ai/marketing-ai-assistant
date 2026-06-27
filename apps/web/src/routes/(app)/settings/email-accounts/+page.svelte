<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore } from '$stores/projects';

  interface EmailAccount {
    id: string;
    email: string;
    displayName?: string;
    provider: 'SMTP' | 'RESEND';
    status: 'ACTIVE' | 'INACTIVE' | 'ERROR';
    smtpHost?: string;
    smtpPort?: number;
    createdAt: string;
  }

  let accounts: EmailAccount[] = [];
  let loading = true;
  let error = '';
  let successMsg = '';

  let showAddModal = false;
  let provider: 'SMTP' | 'RESEND' = 'SMTP';
  let form = {
    email: '',
    displayName: '',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPassword: '',
    imapHost: '',
    imapPort: 993,
    apiKey: '',
  };
  let saving = false;
  let addError = '';

  let testingId: string | null = null;
  let testResults: Record<string, { ok: boolean; message?: string }> = {};
  let deletingId: string | null = null;

  onMount(loadAccounts);

  async function loadAccounts() {
    loading = true;
    error = '';
    try {
      accounts = await api.get<EmailAccount[]>('/email/accounts', {
        organizationId: $organizationIdStore ?? undefined,
      });
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function addAccount() {
    if (!$organizationIdStore) return;
    addError = '';
    saving = true;
    try {
      const dto =
        provider === 'RESEND'
          ? {
              email: form.email,
              displayName: form.displayName || undefined,
              provider: 'RESEND',
              smtpUser: '',
              smtpPassword: form.apiKey,
            }
          : {
              email: form.email,
              displayName: form.displayName || undefined,
              provider: 'SMTP',
              smtpHost: form.smtpHost,
              smtpPort: Number(form.smtpPort),
              smtpUser: form.smtpUser,
              smtpPassword: form.smtpPassword,
              imapHost: form.imapHost || undefined,
              imapPort: form.imapPort ? Number(form.imapPort) : undefined,
            };
      await api.post<EmailAccount>(
        `/email/accounts?organizationId=${$organizationIdStore}`,
        dto,
      );
      showAddModal = false;
      resetForm();
      successMsg = $_('common.success');
      setTimeout(() => (successMsg = ''), 3000);
      await loadAccounts();
    } catch (e: any) {
      addError = e.message;
    } finally {
      saving = false;
    }
  }

  async function testConnection(id: string) {
    testingId = id;
    testResults = { ...testResults, [id]: undefined as any };
    try {
      await api.post(`/email/accounts/${id}/test`);
      testResults = { ...testResults, [id]: { ok: true } };
    } catch (e: any) {
      testResults = { ...testResults, [id]: { ok: false, message: e.message } };
    } finally {
      testingId = null;
    }
  }

  async function deleteAccount(id: string) {
    deletingId = id;
    try {
      await api.delete(`/email/accounts/${id}`);
      accounts = accounts.filter((a) => a.id !== id);
      const { [id]: _removed, ...rest } = testResults;
      testResults = rest;
      successMsg = $_('common.success');
      setTimeout(() => (successMsg = ''), 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      deletingId = null;
    }
  }

  function resetForm() {
    provider = 'SMTP';
    form = { email: '', displayName: '', smtpHost: '', smtpPort: 587, smtpUser: '', smtpPassword: '', imapHost: '', imapPort: 993, apiKey: '' };
    addError = '';
  }

  function openAddModal() {
    resetForm();
    showAddModal = true;
  }

  const providerColors: Record<string, string> = {
    SMTP: 'bg-blue-100 text-blue-700',
    RESEND: 'bg-purple-100 text-purple-700',
  };
  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    INACTIVE: 'bg-surface-2 text-ink-muted',
    ERROR: 'bg-red-100 text-red-700',
  };
</script>

<div class="p-4 sm:p-6 max-w-3xl mx-auto">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
    <div>
      <h1 class="text-2xl font-bold text-ink">{$_('email.accounts')}</h1>
      <p class="text-sm text-ink-muted mt-1">{$_('email.noAccountsDesc')}</p>
    </div>
    <button
      on:click={openAddModal}
      class="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
      {$_('email.addAccount')}
    </button>
  </div>

  {#if error}
    <div class="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
  {/if}
  {#if successMsg}
    <div class="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">{successMsg}</div>
  {/if}

  {#if loading}
    <div class="flex justify-center py-16">
      <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if accounts.length === 0}
    <div class="text-center py-16 bg-surface-2 rounded-xl border border-dashed border-border">
      <div class="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3">
        <svg class="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <p class="text-ink font-medium text-sm">{$_('email.noAccounts')}</p>
      <p class="text-ink-subtle text-xs mt-1 mb-4">{$_('email.noAccountsDesc')}</p>
      <button on:click={openAddModal} class="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
        {$_('email.addAccount')}
      </button>
    </div>
  {:else}
    <div class="space-y-3">
      {#each accounts as account (account.id)}
        <div class="bg-surface border border-border rounded-xl p-4 flex items-start gap-4">
          <div class="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0">
            <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium text-ink text-sm">{account.email}</span>
              {#if account.displayName}
                <span class="text-ink-subtle text-xs">({account.displayName})</span>
              {/if}
            </div>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <span class="text-xs px-2 py-0.5 rounded-full font-medium {providerColors[account.provider] ?? 'bg-surface-2 text-ink-muted'}">
                {account.provider === 'RESEND' ? $_('email.resend') : $_('email.smtp')}
              </span>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium {statusColors[account.status] ?? 'bg-surface-2 text-ink-muted'}">
                {account.status}
              </span>
              {#if account.smtpHost}
                <span class="text-xs text-ink-subtle">{account.smtpHost}:{account.smtpPort}</span>
              {/if}
            </div>
            {#if testResults[account.id]}
              {#if testResults[account.id].ok}
                <p class="text-xs text-green-600 mt-1.5">✓ {$_('email.connectionOk')}</p>
              {:else}
                <p class="text-xs text-red-600 mt-1.5">✗ {$_('email.connectionFailed')}: {testResults[account.id].message}</p>
              {/if}
            {/if}
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              on:click={() => testConnection(account.id)}
              disabled={testingId === account.id}
              class="text-xs text-ink-muted border border-border px-3 py-1.5 rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {testingId === account.id ? '...' : $_('email.testConnection')}
            </button>
            <button
              on:click={() => deleteAccount(account.id)}
              disabled={deletingId === account.id}
              class="text-xs text-red-600 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {$_('email.deleteAccount')}
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Add Account Modal -->
{#if showAddModal}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    on:click|self={() => (showAddModal = false)}
    on:keydown={(e) => e.key === 'Escape' && (showAddModal = false)}
  >
    <div class="bg-surface rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-semibold text-ink">{$_('email.addAccountTitle')}</h2>
          <button
            on:click={() => (showAddModal = false)}
            class="text-ink-subtle hover:text-gray-600 transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {#if addError}
          <div class="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{addError}</div>
        {/if}

        <!-- Provider toggle -->
        <div class="mb-5">
          <label class="block text-sm font-medium text-ink mb-2">{$_('email.provider')}</label>
          <div class="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              on:click={() => (provider = 'SMTP')}
              class="flex-1 py-2 text-sm font-medium transition-colors {provider === 'SMTP' ? 'bg-indigo-600 text-white' : 'bg-surface text-ink-muted hover:bg-surface-2'}"
            >
              {$_('email.smtp')}
            </button>
            <button
              type="button"
              on:click={() => (provider = 'RESEND')}
              class="flex-1 py-2 text-sm font-medium transition-colors {provider === 'RESEND' ? 'bg-indigo-600 text-white' : 'bg-surface text-ink-muted hover:bg-surface-2'}"
            >
              {$_('email.resend')}
            </button>
          </div>
        </div>

        <form on:submit|preventDefault={addAccount} class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-ink mb-1">{$_('email.fromEmail')} *</label>
            <input
              type="email"
              bind:value={form.email}
              required
              placeholder="campaigns@yourcompany.com"
              class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink mb-1">
              {$_('email.displayName')} <span class="text-ink-subtle font-normal">({$_('common.optional')})</span>
            </label>
            <input
              type="text"
              bind:value={form.displayName}
              placeholder={$_('email.placeholderDisplayName')}
              class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {#if provider === 'SMTP'}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-ink mb-1">{$_('email.smtpHost')} *</label>
                <input
                  type="text"
                  bind:value={form.smtpHost}
                  required
                  placeholder="smtp.example.com"
                  class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-ink mb-1">{$_('email.smtpPort')}</label>
                <input
                  type="number"
                  bind:value={form.smtpPort}
                  class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-ink mb-1">{$_('email.username')} *</label>
              <input
                type="text"
                bind:value={form.smtpUser}
                required
                placeholder="user@example.com"
                class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-ink mb-1">{$_('email.password')} *</label>
              <input
                type="password"
                bind:value={form.smtpPassword}
                required
                class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-ink mb-1">
                  {$_('email.imapHost')} <span class="text-ink-subtle font-normal">({$_('common.optional')})</span>
                </label>
                <input
                  type="text"
                  bind:value={form.imapHost}
                  placeholder="imap.example.com"
                  class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-ink mb-1">{$_('email.imapPort')}</label>
                <input
                  type="number"
                  bind:value={form.imapPort}
                  class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          {:else}
            <div>
              <label class="block text-sm font-medium text-ink mb-1">{$_('email.apiKey')} *</label>
              <input
                type="password"
                bind:value={form.apiKey}
                required
                placeholder="re_xxxxxxxxxxxxxxxx"
                class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p class="text-xs text-ink-subtle mt-1">{$_('email.resendApiKeyHint')}</p>
            </div>
          {/if}

          <div class="flex gap-3 pt-2">
            <button
              type="button"
              on:click={() => (showAddModal = false)}
              class="flex-1 border border-border text-ink text-sm font-medium py-2.5 rounded-xl hover:bg-surface-2 transition-colors"
            >
              {$_('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              class="flex-1 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {saving ? $_('common.loading') : $_('email.addAccount')}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}
