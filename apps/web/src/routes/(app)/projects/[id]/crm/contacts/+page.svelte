<script lang="ts">
  import { page } from '$app/stores';
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { crmApi, type CrmContact } from '$lib/api/crm';
  import { contactDisplayName } from '$lib/api/crm-display';
  import { api } from '$lib/api/client';
  import { loadActiveMembers, ownerName, type TeamMember } from '$lib/api/crm-owners';
  import { organizationIdStore } from '$lib/stores/projects';
  import InfoTooltip from '$lib/components/InfoTooltip.svelte';

  $: projectId = $page.params['id'];

  let items: CrmContact[] = [];
  let total = 0;
  let pageNum = 1;
  const pageSize = 25;
  let search = '';
  let statusFilter = '';
  let loading = false;
  let mounted = false;
  let prevProjectId = '';

  // Team members for owner display
  let members: TeamMember[] = [];

  // Modals
  let showAddModal = false;
  let addForm = { email: '', firstName: '', lastName: '', phone: '', status: 'ACTIVE', tags: '' };
  let adding = false;

  // Import
  let importInput: HTMLInputElement;
  let importing = false;

  // Sync
  let syncing = false;

  // Toast
  let toast: { message: string; type: 'success' | 'error' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message, type };
    toastTimer = setTimeout(() => { toast = null; }, 5000);
  }

  async function load() {
    if (!projectId) return;
    loading = true;
    try {
      const res = await crmApi.listContacts(projectId, {
        page: pageNum,
        pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
      });
      items = res.items;
      total = res.total;
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      loading = false;
    }
  }

  async function syncNow() {
    if (!projectId) return;
    syncing = true;
    try {
      const res = await crmApi.syncContacts(projectId);
      showToast(
        `${$_('crm.contacts.syncNow')}: ${$_('crm.contacts.syncResult', { values: { created: res.created, updated: res.updated } })}${res.capped ? ' ' + $_('crm.contacts.capped') : ''}`,
        'success',
      );
      await load();
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      syncing = false;
    }
  }

  onMount(() => {
    mounted = true;
    prevProjectId = projectId;
    load();
    if ($organizationIdStore) {
      loadActiveMembers($organizationIdStore).then((m) => { members = m; });
    }
  });

  // Project-switch safe refetch (route is reused across [id] changes)
  $: if (mounted && projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    pageNum = 1;
    load();
  }

  // Re-load when search or filter changes (debounced via reactive)
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { pageNum = 1; load(); }, 350);
  }

  function onFilterChange() {
    pageNum = 1;
    load();
  }

  $: totalPages = Math.max(1, Math.ceil(total / pageSize));

  function prevPage() { if (pageNum > 1) { pageNum--; load(); } }
  function nextPage() { if (pageNum < totalPages) { pageNum++; load(); } }

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-500/20 text-green-700',
    UNSUBSCRIBED: 'bg-amber-500/20 text-amber-700',
    ARCHIVED: 'bg-surface-2 text-ink-muted',
  };

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
  }

  // Add contact
  async function addContact() {
    adding = true;
    try {
      await crmApi.createContact(projectId, {
        email: addForm.email.trim() || null,
        firstName: addForm.firstName.trim() || null,
        lastName: addForm.lastName.trim() || null,
        phone: addForm.phone.trim() || null,
        status: addForm.status,
        tags: addForm.tags ? addForm.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      });
      addForm = { email: '', firstName: '', lastName: '', phone: '', status: 'ACTIVE', tags: '' };
      showAddModal = false;
      await load();
      showToast($_('crm.contacts.addSuccess'), 'success');
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      adding = false;
    }
  }

  function openImport() {
    if (importInput) importInput.click();
  }

  async function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !projectId) return;
    importing = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.upload<{ created: number; updated: number; errors: string[] }>(
        `/crm/contacts/import?projectId=${projectId}`,
        formData,
      );
      const errorCount = res.errors?.length ?? 0;
      showToast(
        `${$_('crm.contacts.import')}: ${$_('crm.contacts.importResult', { values: { created: res.created, updated: res.updated, errors: errorCount } })}`,
        'success',
      );
      await load();
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      importing = false;
      if (importInput) importInput.value = '';
    }
  }

  function handleAddModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showAddModal = false;
  }
</script>

<div class="p-4 sm:p-6">
  <!-- CRM sub-navigation: Contacts | Companies | Deals | Tasks -->
  <div class="flex items-center gap-1 mb-6 p-1 bg-surface-2 rounded-lg w-fit">
    <a
      href="/projects/{projectId}/crm/contacts"
      class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors bg-surface text-ink shadow-sm"
      aria-current="page"
    >
      {$_('crm.nav.contacts')}
    </a>
    <a
      href="/projects/{projectId}/crm/companies"
      class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors text-ink-muted hover:text-ink"
    >
      {$_('crm.nav.companies')}
    </a>
    <a
      href="/projects/{projectId}/crm/deals"
      class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors text-ink-muted hover:text-ink"
    >
      {$_('crm.nav.deals')}
    </a>
    <a
      href="/projects/{projectId}/crm/tasks"
      class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors text-ink-muted hover:text-ink"
    >
      {$_('crm.nav.tasks')}
    </a>
  </div>

  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
    <div>
      <h1 class="text-2xl font-bold text-ink">{$_('crm.contacts.title')}</h1>
      <p class="text-sm text-ink-muted mt-1">{$_('crm.contacts.count', { values: { count: total } })}</p>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <!-- Hidden file input for CSV import -->
      <input
        bind:this={importInput}
        type="file"
        accept=".csv"
        class="hidden"
        on:change={handleImport}
      />

      <button
        on:click={syncNow}
        disabled={syncing}
        class="border border-border text-ink px-3 py-2 rounded-lg text-sm font-medium hover:bg-surface-2 transition-colors duration-150 flex items-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {#if syncing}
          <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
        {/if}
        {$_('crm.contacts.syncNow')}
      </button>
      <InfoTooltip key="crm.help.sync" side="bottom" />

      <button
        on:click={openImport}
        disabled={importing}
        class="border border-border text-ink px-3 py-2 rounded-lg text-sm font-medium hover:bg-surface-2 transition-colors duration-150 flex items-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {#if importing}
          <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
        {/if}
        {$_('crm.contacts.import')}
      </button>
      <InfoTooltip key="crm.help.csvImport" side="bottom" />

      <button
        on:click={() => (showAddModal = true)}
        class="bg-brand text-white px-3 py-2 rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('crm.contacts.add')}
      </button>
    </div>
  </div>

  <!-- Search + Filter bar -->
  <div class="flex flex-col sm:flex-row gap-3 mb-4">
    <div class="relative flex-1">
      <svg xmlns="http://www.w3.org/2000/svg" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
      <input
        type="text"
        bind:value={search}
        on:input={onSearchInput}
        placeholder={$_('crm.contacts.search')}
        class="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink placeholder:text-ink-subtle"
      />
    </div>
    <select
      bind:value={statusFilter}
      on:change={onFilterChange}
      class="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
    >
      <option value="">{$_('common.status')} — {$_('common.filter')}</option>
      <option value="ACTIVE">{$_('crm.status.ACTIVE')}</option>
      <option value="UNSUBSCRIBED">{$_('crm.status.UNSUBSCRIBED')}</option>
      <option value="ARCHIVED">{$_('crm.status.ARCHIVED')}</option>
    </select>
  </div>

  {#if loading}
    <!-- Loading skeleton -->
    <div class="bg-surface rounded-xl border border-border animate-pulse">
      <div class="p-4 border-b border-border">
        <div class="h-4 bg-surface-2 rounded w-1/3"></div>
      </div>
      {#each Array(6) as _}
        <div class="p-4 border-b border-border flex gap-4">
          <div class="h-4 bg-surface-2 rounded w-1/4"></div>
          <div class="h-4 bg-surface-2 rounded w-1/4"></div>
          <div class="h-4 bg-surface-2 rounded w-1/6"></div>
          <div class="h-4 bg-surface-2 rounded w-1/6"></div>
        </div>
      {/each}
    </div>
  {:else if items.length === 0}
    <!-- Empty state -->
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-20 h-20 bg-brand-subtle/10 rounded-2xl flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-ink mb-2">{$_('crm.contacts.empty')}</h2>
      <p class="text-ink-muted mb-6 max-w-sm text-sm">
        {#if search || statusFilter}
          {$_('crm.contacts.emptyFiltered')}
        {:else}
          {$_('crm.contacts.emptyHint')}
        {/if}
      </p>
      {#if !search && !statusFilter}
        <button
          on:click={() => (showAddModal = true)}
          class="bg-brand text-white px-6 py-3 rounded-xl font-medium hover:brightness-110 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {$_('crm.contacts.add')}
        </button>
      {/if}
    </div>
  {:else}
    <!-- Contacts table -->
    <div class="bg-surface rounded-xl border border-border overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border bg-surface-2/50">
              <th class="text-left text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('crm.contacts.columns.name')}</th>
              <th class="text-left text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('crm.contacts.columns.email')}</th>
              <th class="text-left text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('crm.contacts.columns.company')}</th>
              <th class="text-left text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('crm.contacts.columns.tags')}</th>
              <th class="text-left text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('crm.contact.owner')}</th>
              <th class="text-left text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('crm.contacts.columns.status')} <InfoTooltip key="crm.help.status" /></th>
              <th class="text-left text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('crm.contacts.columns.lastSeen')}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            {#each items as contact (contact.id)}
              <tr class="hover:bg-surface-2/50 transition-colors duration-100">
                <!-- Name -->
                <td class="px-5 py-3.5">
                  <a
                    href="/projects/{projectId}/crm/contacts/{contact.id}"
                    class="text-sm font-medium text-ink hover:text-brand transition-colors"
                  >
                    {contactDisplayName(contact, $_('crm.contacts.anonymous'))}
                  </a>
                  {#if contact.source}
                    <span class="ml-2 text-xs px-1.5 py-0.5 rounded bg-surface-2 text-ink-subtle font-mono">
                      {$_(`crm.source.${contact.source}`, { default: contact.source })}
                    </span>
                  {/if}
                </td>

                <!-- Email -->
                <td class="px-5 py-3.5">
                  {#if contact.email}
                    <a href="mailto:{contact.email}" class="text-sm text-primary-600 hover:underline">{contact.email}</a>
                  {:else}
                    <span class="text-sm text-ink-subtle">—</span>
                  {/if}
                </td>

                <!-- Company -->
                <td class="px-5 py-3.5">
                  {#if contact.company?.name}
                    <span class="text-sm text-ink">{contact.company.name}</span>
                  {:else}
                    <span class="text-sm text-ink-subtle">—</span>
                  {/if}
                </td>

                <!-- Tags -->
                <td class="px-5 py-3.5">
                  {#if contact.tags && contact.tags.length > 0}
                    <div class="flex flex-wrap gap-1">
                      {#each contact.tags.slice(0, 3) as tag}
                        <span class="text-xs px-1.5 py-0.5 rounded bg-brand-subtle/15 text-brand-subtle-fg font-medium">{tag}</span>
                      {/each}
                      {#if contact.tags.length > 3}
                        <span class="text-xs text-ink-subtle">+{contact.tags.length - 3}</span>
                      {/if}
                    </div>
                  {:else}
                    <span class="text-sm text-ink-subtle">—</span>
                  {/if}
                </td>

                <!-- Owner -->
                <td class="px-5 py-3.5">
                  <span class="text-sm text-ink-muted">{ownerName(members, contact.ownerId, $_('crm.unassigned'))}</span>
                </td>

                <!-- Status -->
                <td class="px-5 py-3.5">
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium {statusColors[contact.status] || 'bg-surface-2 text-ink-muted'}">
                    {$_(`crm.status.${contact.status}`, { default: contact.status })}
                  </span>
                </td>

                <!-- Last Seen -->
                <td class="px-5 py-3.5">
                  <span class="text-sm text-ink-muted">{formatDate(contact.lastSeen)}</span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination footer -->
      <div class="px-5 py-3 border-t border-border bg-surface-2/30 flex items-center justify-between">
        <span class="text-xs text-ink-muted">
          {(pageNum - 1) * pageSize + 1}–{Math.min(pageNum * pageSize, total)} {$_('crm.contacts.ofTotal')} {total}
        </span>
        <div class="flex items-center gap-2">
          <button
            on:click={prevPage}
            disabled={pageNum <= 1}
            class="px-3 py-1 text-xs border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {$_('common.previous')}
          </button>
          <span class="text-xs text-ink-muted">{pageNum} / {totalPages}</span>
          <button
            on:click={nextPage}
            disabled={pageNum >= totalPages}
            class="px-3 py-1 text-xs border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {$_('common.next')}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Toast notification -->
{#if toast}
  <div class="fixed bottom-6 right-6 z-[60] max-w-sm">
    <div class="flex items-start gap-3 rounded-xl shadow-lg border px-4 py-3 text-sm
      {toast.type === 'success' ? 'bg-green-500/12 border-green-500/30 text-green-800' : 'bg-red-500/12 border-red-500/30 text-red-800'}">
      {#if toast.type === 'success'}
        <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 w-4 h-4 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      {/if}
      <span>{toast.message}</span>
      <button
        on:click={() => (toast = null)}
        aria-label={$_('common.close')}
        class="ml-auto flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<!-- Add Contact Modal -->
{#if showAddModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    on:click|self={() => (showAddModal = false)}
    on:keydown={handleAddModalKeydown}
  >
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-border flex items-center gap-2.5">
        <div class="w-8 h-8 bg-brand-subtle/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('crm.contacts.add')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="crm-firstName" class="block text-sm font-medium text-ink mb-1.5">{$_('crm.contacts.form.firstName')}</label>
            <input
              id="crm-firstName"
              type="text"
              bind:value={addForm.firstName}
              class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
              placeholder="Ann"
            />
          </div>
          <div>
            <label for="crm-lastName" class="block text-sm font-medium text-ink mb-1.5">{$_('crm.contacts.form.lastName')}</label>
            <input
              id="crm-lastName"
              type="text"
              bind:value={addForm.lastName}
              class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
              placeholder="Lee"
            />
          </div>
        </div>

        <div>
          <label for="crm-email" class="block text-sm font-medium text-ink mb-1.5">{$_('crm.contacts.form.email')}</label>
          <input
            id="crm-email"
            type="email"
            bind:value={addForm.email}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
            placeholder="contact@example.com"
          />
        </div>

        <div>
          <label for="crm-phone" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.contacts.form.phone')}
            <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
          </label>
          <input
            id="crm-phone"
            type="tel"
            bind:value={addForm.phone}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
            placeholder="+1 555 000 0000"
          />
        </div>

        <div>
          <label for="crm-status" class="block text-sm font-medium text-ink mb-1.5">{$_('crm.contacts.columns.status')}</label>
          <select
            id="crm-status"
            bind:value={addForm.status}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
          >
            <option value="ACTIVE">{$_('crm.status.ACTIVE')}</option>
            <option value="UNSUBSCRIBED">{$_('crm.status.UNSUBSCRIBED')}</option>
            <option value="ARCHIVED">{$_('crm.status.ARCHIVED')}</option>
          </select>
        </div>

        <div>
          <label for="crm-tags" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.contacts.columns.tags')}
            <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('crm.contacts.form.tagsHint')}</span>
          </label>
          <input
            id="crm-tags"
            type="text"
            bind:value={addForm.tags}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
            placeholder="vip, newsletter, prospect"
          />
        </div>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={addContact}
          disabled={adding || (!addForm.email.trim() && !addForm.firstName.trim())}
          class="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if adding}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('common.loading')}
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {$_('crm.contacts.add')}
          {/if}
        </button>
        <button
          on:click={() => (showAddModal = false)}
          class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
