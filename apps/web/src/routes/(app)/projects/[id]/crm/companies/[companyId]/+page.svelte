<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { crmApi, type CrmCompany, type CrmContact } from '$lib/api/crm';
  import { contactDisplayName } from '$lib/api/crm-display';

  $: projectId = $page.params['id'];
  $: companyId = $page.params['companyId'];

  let company: CrmCompany | null = null;
  let loading = true;
  let saving = false;
  let mounted = false;
  let prevProjectId = '';

  // Editable form fields
  let name = '';
  let domain = '';
  let website = '';
  let notes = '';

  // Delete modal
  let showDeleteModal = false;
  let deleting = false;

  // Toast
  let toast: { message: string; type: 'success' | 'error' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message, type };
    toastTimer = setTimeout(() => { toast = null; }, 5000);
  }

  function populateForm(c: CrmCompany) {
    name = c.name ?? '';
    domain = c.domain ?? '';
    website = c.website ?? '';
    notes = c.notes ?? '';
  }

  async function load() {
    if (!projectId || !companyId) return;
    loading = true;
    try {
      company = await crmApi.getCompany(projectId, companyId);
      populateForm(company);
    } catch (e: unknown) {
      showToast((e as Error).message || $_('crm.company.loadError'), 'error');
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    mounted = true;
    prevProjectId = projectId;
    await load();
  });

  // Project-switch guard: redirect to new project's companies list
  $: if (mounted && projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    goto(`/projects/${projectId}/crm/companies`);
  }

  // Dirty detection
  $: isDirty =
    company !== null &&
    (name !== (company.name ?? '') ||
      domain !== (company.domain ?? '') ||
      website !== (company.website ?? '') ||
      notes !== (company.notes ?? ''));

  function computePatch(): Partial<CrmCompany> {
    if (!company) return {};
    const patch: Partial<CrmCompany> = {};
    if (name !== (company.name ?? '')) patch.name = name || undefined;
    if (domain !== (company.domain ?? '')) patch.domain = domain || null;
    if (website !== (company.website ?? '')) patch.website = website || null;
    if (notes !== (company.notes ?? '')) patch.notes = notes || null;
    return patch;
  }

  async function save() {
    if (!company || !projectId || !companyId || !isDirty) return;
    const patch = computePatch();
    saving = true;
    try {
      company = await crmApi.updateCompany(projectId, companyId, patch);
      populateForm(company);
      showToast($_('crm.company.saveSuccess'), 'success');
    } catch (e: unknown) {
      showToast((e as Error).message || $_('crm.company.saveError'), 'error');
    } finally {
      saving = false;
    }
  }

  async function confirmDelete() {
    if (!projectId || !companyId) return;
    deleting = true;
    try {
      await crmApi.deleteCompany(projectId, companyId);
      goto(`/projects/${projectId}/crm/companies`);
    } catch (e: unknown) {
      showToast((e as Error).message || $_('crm.company.deleteError'), 'error');
      deleting = false;
      showDeleteModal = false;
    }
  }

  function handleDeleteModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showDeleteModal = false;
  }

  $: contacts = (company?.contacts ?? []) as CrmContact[];
</script>

<div class="p-4 sm:p-6 max-w-5xl mx-auto">
  <!-- Back link -->
  <div class="mb-6">
    <a
      href="/projects/{projectId}/crm/companies"
      class="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors mb-3"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
      </svg>
      {$_('crm.company.backToList')}
    </a>

    {#if loading}
      <div class="h-8 w-56 bg-surface-2 rounded-lg animate-pulse"></div>
    {:else if company}
      <h1 class="text-2xl font-bold text-ink">{company.name}</h1>
    {:else}
      <h1 class="text-2xl font-bold text-ink">{$_('crm.company.title')}</h1>
    {/if}
  </div>

  {#if loading}
    <!-- Loading skeleton -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-5">
        {#each Array(2) as _}
          <div class="bg-surface rounded-xl border border-border p-5 animate-pulse space-y-3">
            <div class="h-4 bg-surface-2 rounded w-1/4"></div>
            <div class="h-9 bg-surface-2 rounded"></div>
            <div class="h-9 bg-surface-2 rounded"></div>
          </div>
        {/each}
      </div>
      <div class="space-y-5">
        <div class="bg-surface rounded-xl border border-border p-5 animate-pulse space-y-4 h-48">
          <div class="h-4 bg-surface-2 rounded w-1/2"></div>
          <div class="h-4 bg-surface-2 rounded w-3/4"></div>
        </div>
      </div>
    </div>
  {:else if !company}
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <p class="text-ink-muted">{$_('crm.company.notFound')}</p>
      <a
        href="/projects/{projectId}/crm/companies"
        class="mt-4 text-sm text-brand hover:underline"
      >
        {$_('crm.company.backToList')}
      </a>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left column: fields + contacts + save -->
      <div class="lg:col-span-2 space-y-5">

        <!-- Details card -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('crm.company.details')}</h2>
          </div>
          <div class="p-5 space-y-4">
            <div>
              <label for="co-name" class="block text-sm font-medium text-ink mb-1.5">
                {$_('crm.company.name')}
              </label>
              <input
                id="co-name"
                type="text"
                bind:value={name}
                class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
              />
            </div>

            <div>
              <label for="co-domain" class="block text-sm font-medium text-ink mb-1.5">
                {$_('crm.company.domain')}
                <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
              </label>
              <input
                id="co-domain"
                type="text"
                bind:value={domain}
                placeholder={$_('crm.companies.form.domainPlaceholder')}
                class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
              />
            </div>

            <div>
              <label for="co-website" class="block text-sm font-medium text-ink mb-1.5">
                {$_('crm.company.website')}
                <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
              </label>
              <input
                id="co-website"
                type="url"
                bind:value={website}
                placeholder={$_('crm.companies.form.websitePlaceholder')}
                class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
              />
            </div>
          </div>
        </div>

        <!-- Notes card -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('crm.company.notes')}</h2>
          </div>
          <div class="p-5">
            <textarea
              id="co-notes"
              bind:value={notes}
              rows={5}
              placeholder={$_('crm.company.notesPlaceholder')}
              class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink resize-none"
            ></textarea>
          </div>
        </div>

        <!-- Contacts in this company -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('crm.company.contacts')}</h2>
          </div>
          {#if contacts.length === 0}
            <div class="px-5 py-8 text-center">
              <p class="text-sm text-ink-muted">{$_('crm.company.noContacts')}</p>
            </div>
          {:else}
            <ul class="divide-y divide-border">
              {#each contacts as contact (contact.id)}
                <li class="px-5 py-3 hover:bg-surface-2/50 transition-colors duration-100">
                  <a
                    href="/projects/{projectId}/crm/contacts/{contact.id}"
                    class="flex items-center gap-3 group"
                  >
                    <div class="w-7 h-7 rounded-full bg-brand-subtle/15 flex items-center justify-center flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                      </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-ink group-hover:text-brand transition-colors truncate">
                        {contactDisplayName(contact, $_('crm.contacts.anonymous'))}
                      </p>
                      {#if contact.email}
                        <p class="text-xs text-ink-muted truncate">{contact.email}</p>
                      {/if}
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-ink-subtle group-hover:text-brand transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <!-- Save button -->
        <div>
          <button
            on:click={save}
            disabled={!isDirty || saving}
            class="bg-brand text-white px-5 py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-40 text-sm flex items-center gap-2 cursor-pointer"
          >
            {#if saving}
              <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              {$_('crm.company.saving')}
            {:else}
              {$_('crm.company.save')}
            {/if}
          </button>
        </div>
      </div>

      <!-- Right column: meta + actions -->
      <div class="space-y-5">

        <!-- Meta card -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('crm.company.meta')}</h2>
          </div>
          <div class="p-5 space-y-4">
            <div>
              <p class="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">{$_('crm.company.owner')}</p>
              <p class="text-sm text-ink font-mono break-all">{company.ownerId ?? '—'}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">{$_('crm.companies.columns.contacts')}</p>
              <p class="text-sm text-ink">{$_('crm.companies.contactCount', { values: { count: contacts.length } })}</p>
            </div>
          </div>
        </div>

        <!-- Actions card -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('common.actions')}</h2>
          </div>
          <div class="p-5">
            <button
              type="button"
              on:click={() => (showDeleteModal = true)}
              disabled={saving}
              class="w-full border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-400/10 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
            >
              {$_('crm.company.delete')}
            </button>
          </div>
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
        class="ml-auto flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<!-- Delete confirm modal -->
{#if showDeleteModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    on:click|self={() => (showDeleteModal = false)}
    on:keydown={handleDeleteModalKeydown}
  >
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-border flex items-center gap-3">
        <div class="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('crm.company.deleteTitle')}</h2>
      </div>
      <div class="p-6">
        <p class="text-sm text-ink-muted">
          {$_('crm.company.deleteConfirm', { values: { name: company?.name ?? '' } })}
        </p>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={confirmDelete}
          disabled={deleting}
          class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if deleting}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          {/if}
          {$_('common.delete')}
        </button>
        <button
          on:click={() => (showDeleteModal = false)}
          disabled={deleting}
          class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer disabled:opacity-50"
        >
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
