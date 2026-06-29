<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { crmApi, type CrmCompany } from '$lib/api/crm';
  import { loadActiveMembers, ownerName, type TeamMember } from '$lib/api/crm-owners';
  import { organizationIdStore } from '$lib/stores/projects';

  $: projectId = $page.params['id'];

  let items: CrmCompany[] = [];
  let total = 0;
  let search = '';
  let loading = false;
  let mounted = false;
  let prevProjectId = '';

  // Team members for owner display
  let members: TeamMember[] = [];

  // Add modal
  let showAddModal = false;
  let addForm = { name: '', domain: '', website: '', notes: '' };
  let adding = false;

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
      const res = await crmApi.listCompanies(projectId, search || undefined);
      items = res.items;
      total = res.total;
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      loading = false;
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

  // Project-switch safe refetch
  $: if (mounted && projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    load();
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { load(); }, 350);
  }

  // Add company
  async function addCompany() {
    if (!addForm.name.trim()) return;
    adding = true;
    try {
      await crmApi.createCompany(projectId, {
        name: addForm.name.trim(),
        domain: addForm.domain.trim() || null,
        website: addForm.website.trim() || null,
        notes: addForm.notes.trim() || null,
      });
      addForm = { name: '', domain: '', website: '', notes: '' };
      showAddModal = false;
      await load();
      showToast($_('crm.companies.addSuccess'), 'success');
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      adding = false;
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
      class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors text-ink-muted hover:text-ink"
    >
      {$_('crm.nav.contacts')}
    </a>
    <a
      href="/projects/{projectId}/crm/companies"
      class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors bg-surface text-ink shadow-sm"
      aria-current="page"
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
      <h1 class="text-2xl font-bold text-ink">{$_('crm.companies.title')}</h1>
      <p class="text-sm text-ink-muted mt-1">{$_('crm.companies.count', { values: { count: total } })}</p>
    </div>
    <div class="flex items-center gap-2">
      <button
        on:click={() => (showAddModal = true)}
        class="bg-brand text-white px-3 py-2 rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('crm.companies.add')}
      </button>
    </div>
  </div>

  <!-- Search bar -->
  <div class="mb-4">
    <div class="relative max-w-sm">
      <svg xmlns="http://www.w3.org/2000/svg" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
      <input
        type="text"
        bind:value={search}
        on:input={onSearchInput}
        placeholder={$_('crm.companies.search')}
        class="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink placeholder:text-ink-subtle"
      />
    </div>
  </div>

  {#if loading}
    <!-- Loading skeleton -->
    <div class="bg-surface rounded-xl border border-border animate-pulse">
      <div class="p-4 border-b border-border">
        <div class="h-4 bg-surface-2 rounded w-1/3"></div>
      </div>
      {#each Array(5) as _}
        <div class="p-4 border-b border-border flex gap-4">
          <div class="h-4 bg-surface-2 rounded w-1/3"></div>
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
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-ink mb-2">{$_('crm.companies.empty')}</h2>
      <p class="text-ink-muted mb-6 max-w-sm text-sm">
        {#if search}
          {$_('crm.companies.emptyFiltered')}
        {:else}
          {$_('crm.companies.emptyHint')}
        {/if}
      </p>
      {#if !search}
        <button
          on:click={() => (showAddModal = true)}
          class="bg-brand text-white px-6 py-3 rounded-xl font-medium hover:brightness-110 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {$_('crm.companies.add')}
        </button>
      {/if}
    </div>
  {:else}
    <!-- Companies table -->
    <div class="bg-surface rounded-xl border border-border overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border bg-surface-2/50">
              <th class="text-left text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('crm.companies.columns.name')}</th>
              <th class="text-left text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('crm.companies.columns.domain')}</th>
              <th class="text-left text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('crm.companies.columns.contacts')}</th>
              <th class="text-left text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('crm.companies.columns.owner')}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            {#each items as company (company.id)}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <tr
              class="hover:bg-surface-2/50 transition-colors duration-100 cursor-pointer"
              on:click={() => goto(`/projects/${projectId}/crm/companies/${company.id}`)}
            >
                <!-- Name -->
                <td class="px-5 py-3.5">
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <a
                    href="/projects/{projectId}/crm/companies/{company.id}"
                    class="text-sm font-medium text-ink hover:text-brand transition-colors"
                    on:click|stopPropagation
                  >
                    {company.name}
                  </a>
                </td>

                <!-- Domain -->
                <td class="px-5 py-3.5">
                  {#if company.domain}
                    <span class="text-sm text-ink-muted font-mono">{company.domain}</span>
                  {:else}
                    <span class="text-sm text-ink-subtle">—</span>
                  {/if}
                </td>

                <!-- Contact count -->
                <td class="px-5 py-3.5">
                  <span class="text-sm text-ink-muted">
                    {$_('crm.companies.contactCount', { values: { count: company._count?.contacts ?? 0 } })}
                  </span>
                </td>

                <!-- Owner -->
                <td class="px-5 py-3.5">
                  <span class="text-sm text-ink-muted">{ownerName(members, company.ownerId, $_('crm.unassigned'))}</span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
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
        class="ml-auto flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<!-- Add Company Modal -->
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
        <h2 class="text-lg font-semibold text-ink">{$_('crm.companies.add')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="co-name" class="block text-sm font-medium text-ink mb-1.5">{$_('crm.companies.form.name')}</label>
          <input
            id="co-name"
            type="text"
            bind:value={addForm.name}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
            placeholder={$_('crm.companies.form.namePlaceholder')}
          />
        </div>

        <div>
          <label for="co-domain" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.companies.form.domain')}
            <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
          </label>
          <input
            id="co-domain"
            type="text"
            bind:value={addForm.domain}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
            placeholder={$_('crm.companies.form.domainPlaceholder')}
          />
        </div>

        <div>
          <label for="co-website" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.companies.form.website')}
            <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
          </label>
          <input
            id="co-website"
            type="url"
            bind:value={addForm.website}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
            placeholder={$_('crm.companies.form.websitePlaceholder')}
          />
        </div>

        <div>
          <label for="co-notes" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.companies.form.notes')}
            <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
          </label>
          <textarea
            id="co-notes"
            bind:value={addForm.notes}
            rows={3}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink resize-none"
          ></textarea>
        </div>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={addCompany}
          disabled={adding || !addForm.name.trim()}
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
            {$_('crm.companies.add')}
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
