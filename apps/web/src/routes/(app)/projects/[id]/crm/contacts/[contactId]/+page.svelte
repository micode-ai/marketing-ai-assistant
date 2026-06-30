<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { crmApi, type CrmContact } from '$lib/api/crm';
  import { contactDisplayName } from '$lib/api/crm-display';
  import { loadActiveMembers, ownerName, type TeamMember } from '$lib/api/crm-owners';
  import { organizationIdStore } from '$lib/stores/projects';
  import CrmTimeline from '$lib/components/crm/CrmTimeline.svelte';
  import InfoTooltip from '$lib/components/InfoTooltip.svelte';

  $: projectId = $page.params['id'];
  $: contactId = $page.params['contactId'];

  interface Company { id: string; name: string; }

  let contact: CrmContact | null = null;
  let loading = true;
  let saving = false;
  let mounted = false;
  let prevProjectId = '';

  // Editable form fields
  let firstName = '';
  let lastName = '';
  let email = '';
  let phone = '';
  let notes = '';
  let companyId = '';
  let ownerId = '';
  let tags: string[] = [];
  let newTag = '';

  // Companies dropdown
  let companies: Company[] = [];

  // Team members for owner picker
  let members: TeamMember[] = [];

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

  function populateForm(c: CrmContact) {
    firstName = c.firstName ?? '';
    lastName = c.lastName ?? '';
    email = c.email ?? '';
    phone = c.phone ?? '';
    notes = c.notes ?? '';
    companyId = c.companyId ?? '';
    ownerId = c.ownerId ?? '';
    tags = [...(c.tags ?? [])];
  }

  async function load() {
    if (!projectId || !contactId) return;
    loading = true;
    try {
      contact = await crmApi.getContact(projectId, contactId);
      populateForm(contact);
    } catch (e: unknown) {
      showToast((e as Error).message || $_('crm.contact.loadError'), 'error');
    } finally {
      loading = false;
    }
  }

  async function loadCompanies() {
    try {
      const res = await crmApi.listCompanies(projectId);
      companies = res.items as Company[];
    } catch {
      companies = [];
    }
  }

  onMount(async () => {
    mounted = true;
    prevProjectId = projectId;
    if ($organizationIdStore) {
      loadActiveMembers($organizationIdStore).then((m) => { members = m; });
    }
    await Promise.all([load(), loadCompanies()]);
  });

  // Project-switch guard: redirect to new project's contacts list
  $: if (mounted && projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    goto(`/projects/${projectId}/crm/contacts`);
  }

  // Dirty detection — all dependencies listed directly for Svelte reactivity tracking
  $: isDirty =
    contact !== null &&
    (firstName !== (contact.firstName ?? '') ||
      lastName !== (contact.lastName ?? '') ||
      email !== (contact.email ?? '') ||
      phone !== (contact.phone ?? '') ||
      notes !== (contact.notes ?? '') ||
      companyId !== (contact.companyId ?? '') ||
      ownerId !== (contact.ownerId ?? '') ||
      JSON.stringify(tags) !== JSON.stringify(contact.tags ?? []));

  function computePatch(): Partial<CrmContact> {
    if (!contact) return {};
    const patch: Partial<CrmContact> = {};
    if (firstName !== (contact.firstName ?? '')) patch.firstName = firstName || null;
    if (lastName !== (contact.lastName ?? '')) patch.lastName = lastName || null;
    if (email !== (contact.email ?? '')) patch.email = email || null;
    if (phone !== (contact.phone ?? '')) patch.phone = phone || null;
    if (notes !== (contact.notes ?? '')) patch.notes = notes || null;
    if (companyId !== (contact.companyId ?? '')) patch.companyId = companyId || null;
    if (ownerId !== (contact.ownerId ?? '')) patch.ownerId = ownerId || null;
    if (JSON.stringify(tags) !== JSON.stringify(contact.tags ?? [])) patch.tags = tags;
    return patch;
  }

  async function save() {
    if (!contact || !projectId || !contactId || !isDirty) return;
    const patch = computePatch();
    saving = true;
    try {
      contact = await crmApi.updateContact(projectId, contactId, patch);
      populateForm(contact);
      showToast($_('crm.contact.saveSuccess'), 'success');
    } catch (e: unknown) {
      showToast((e as Error).message || $_('crm.contact.saveError'), 'error');
    } finally {
      saving = false;
    }
  }

  async function archive() {
    if (!projectId || !contactId || !contact) return;
    saving = true;
    try {
      contact = await crmApi.updateContact(projectId, contactId, { status: 'ARCHIVED' });
      showToast($_('crm.contact.archiveSuccess'), 'success');
    } catch (e: unknown) {
      showToast((e as Error).message || $_('crm.contact.archiveError'), 'error');
    } finally {
      saving = false;
    }
  }

  async function confirmDelete() {
    if (!projectId || !contactId) return;
    deleting = true;
    try {
      await crmApi.deleteContact(projectId, contactId);
      goto(`/projects/${projectId}/crm/contacts`);
    } catch (e: unknown) {
      showToast((e as Error).message || $_('crm.contact.deleteError'), 'error');
      deleting = false;
      showDeleteModal = false;
    }
  }

  function addTag() {
    const t = newTag.trim();
    if (t && !tags.includes(t)) {
      tags = [...tags, t];
    }
    newTag = '';
  }

  function removeTag(tag: string) {
    tags = tags.filter((t) => t !== tag);
  }

  function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  }

  function handleDeleteModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showDeleteModal = false;
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function renderUtm(utm: unknown): string {
    if (!utm || typeof utm !== 'object') return '—';
    const entries = Object.entries(utm as Record<string, string>).filter(([, v]) => v);
    return entries.map(([k, v]) => `${k}: ${v}`).join(' · ') || '—';
  }

  $: contactName = contact
    ? contactDisplayName(contact, $_('crm.contacts.anonymous'))
    : '';

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-500/20 text-green-700',
    UNSUBSCRIBED: 'bg-amber-500/20 text-amber-700',
    ARCHIVED: 'bg-surface-2 text-ink-muted',
  };
</script>

<div class="p-4 sm:p-6 max-w-5xl mx-auto">
  <!-- Back link -->
  <div class="mb-6">
    <a
      href="/projects/{projectId}/crm/contacts"
      class="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors mb-3"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
      </svg>
      {$_('crm.contact.backToList')}
    </a>

    {#if loading}
      <div class="h-8 w-56 bg-surface-2 rounded-lg animate-pulse"></div>
    {:else if contact}
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <h1 class="text-2xl font-bold text-ink">{contactName}</h1>
        <span class="text-xs px-2.5 py-1 rounded-full font-medium w-fit {statusColors[contact.status] ?? 'bg-surface-2 text-ink-muted'}">
          {$_(`crm.status.${contact.status}`, { default: contact.status })}
        </span>
      </div>
    {:else}
      <h1 class="text-2xl font-bold text-ink">{$_('crm.contact.title')}</h1>
    {/if}
  </div>

  {#if loading}
    <!-- Loading skeleton -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-5">
        {#each Array(3) as _}
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
          <div class="h-4 bg-surface-2 rounded w-2/3"></div>
        </div>
      </div>
    </div>
  {:else if !contact}
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <p class="text-ink-muted">{$_('crm.contact.notFound')}</p>
      <a
        href="/projects/{projectId}/crm/contacts"
        class="mt-4 text-sm text-brand hover:underline"
      >
        {$_('crm.contact.backToList')}
      </a>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left column: profile + tags + notes + save -->
      <div class="lg:col-span-2 space-y-5">

        <!-- Profile card -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('crm.contact.profile')}</h2>
          </div>
          <div class="p-5 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="detail-firstName" class="block text-sm font-medium text-ink mb-1.5">
                  {$_('crm.contact.firstName')}
                </label>
                <input
                  id="detail-firstName"
                  type="text"
                  bind:value={firstName}
                  class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
                />
              </div>
              <div>
                <label for="detail-lastName" class="block text-sm font-medium text-ink mb-1.5">
                  {$_('crm.contact.lastName')}
                </label>
                <input
                  id="detail-lastName"
                  type="text"
                  bind:value={lastName}
                  class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
                />
              </div>
            </div>
            <div>
              <label for="detail-email" class="block text-sm font-medium text-ink mb-1.5">
                {$_('crm.contact.email')}
              </label>
              <input
                id="detail-email"
                type="email"
                bind:value={email}
                class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
              />
            </div>
            <div>
              <label for="detail-phone" class="block text-sm font-medium text-ink mb-1.5">
                {$_('crm.contact.phone')}
                <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
              </label>
              <input
                id="detail-phone"
                type="tel"
                bind:value={phone}
                placeholder="+1 555 000 0000"
                class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
              />
            </div>
          </div>
        </div>

        <!-- Tags card -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('crm.contact.tags')}</h2>
          </div>
          <div class="p-5">
            <div class="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
              {#each tags as tag}
                <span class="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-brand-subtle/15 text-brand-subtle-fg font-medium">
                  {tag}
                  <button
                    type="button"
                    on:click={() => removeTag(tag)}
                    aria-label={$_('common.delete')}
                    class="ml-0.5 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              {/each}
              {#if tags.length === 0}
                <span class="text-sm text-ink-subtle">—</span>
              {/if}
            </div>
            <div class="flex gap-2">
              <input
                type="text"
                bind:value={newTag}
                on:keydown={handleTagKeydown}
                placeholder={$_('crm.contact.tagPlaceholder')}
                class="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
              />
              <button
                type="button"
                on:click={addTag}
                class="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-surface-2 transition-colors duration-150 cursor-pointer flex-shrink-0"
              >
                {$_('crm.contact.addTag')}
              </button>
            </div>
          </div>
        </div>

        <!-- Notes card -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('crm.contact.notes')}</h2>
          </div>
          <div class="p-5">
            <textarea
              id="detail-notes"
              bind:value={notes}
              rows={5}
              placeholder={$_('crm.contact.notesPlaceholder')}
              class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink resize-none"
            ></textarea>
          </div>
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
              {$_('crm.contact.saving')}
            {:else}
              {$_('crm.contact.save')}
            {/if}
          </button>
        </div>
      </div>

      <!-- Right column: details + behaviour + actions -->
      <div class="space-y-5">

        <!-- Details card: company, owner, source, status -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('crm.contact.details')}</h2>
          </div>
          <div class="p-5 space-y-4">
            <!-- Company selector -->
            <div>
              <label for="detail-company" class="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
                {$_('crm.contact.company')}
              </label>
              <select
                id="detail-company"
                bind:value={companyId}
                class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
              >
                <option value="">{$_('crm.contact.noCompany')}</option>
                {#each companies as co}
                  <option value={co.id}>{co.name}</option>
                {/each}
              </select>
            </div>

            <!-- Owner picker -->
            <div>
              <label for="detail-owner" class="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
                {$_('crm.contact.owner')} <InfoTooltip key="crm.help.owner" />
              </label>
              <select
                id="detail-owner"
                bind:value={ownerId}
                class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
              >
                <option value="">{$_('crm.unassigned')}</option>
                {#each members as member (member.userId)}
                  <option value={member.userId}>{member.name}</option>
                {/each}
              </select>
            </div>

            <!-- Source (read-only) -->
            <div>
              <p class="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">{$_('crm.contact.source')} <InfoTooltip key="crm.help.source" /></p>
              <p class="text-sm text-ink">{$_(`crm.source.${contact.source}`, { default: contact.source })}</p>
            </div>

            <!-- Status (read-only label; changed via Archive action) -->
            <div>
              <p class="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">{$_('crm.contact.status')}</p>
              <span class="text-xs px-2.5 py-1 rounded-full font-medium {statusColors[contact.status] ?? 'bg-surface-2 text-ink-muted'}">
                {$_(`crm.status.${contact.status}`, { default: contact.status })}
              </span>
            </div>
          </div>
        </div>

        <!-- Behaviour card -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('crm.contact.behaviour')}</h2>
          </div>
          <div class="p-5 space-y-4">
            <div>
              <p class="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">{$_('crm.contact.lastSeen')}</p>
              <p class="text-sm text-ink">{formatDate(contact.lastSeen)}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">{$_('crm.contact.utmFirst')}</p>
              <p class="text-xs text-ink-muted font-mono break-all leading-relaxed">{renderUtm(contact.firstUtm)}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">{$_('crm.contact.utmLast')}</p>
              <p class="text-xs text-ink-muted font-mono break-all leading-relaxed">{renderUtm(contact.lastUtm)}</p>
            </div>
          </div>
        </div>

        <!-- Actions card -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('common.actions')}</h2>
          </div>
          <div class="p-5 space-y-3">
            {#if contact.status !== 'ARCHIVED'}
              <button
                type="button"
                on:click={archive}
                disabled={saving}
                class="w-full border border-amber-400 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400/10 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
              >
                {$_('crm.contact.archive')}
              </button>
            {/if}
            <button
              type="button"
              on:click={() => (showDeleteModal = true)}
              disabled={saving}
              class="w-full border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-400/10 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
            >
              {$_('crm.contact.delete')}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline section -->
    <div class="mt-8">
      <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
        {$_('crm.timeline.heading')} <InfoTooltip key="crm.help.timeline" />
      </h2>
      <CrmTimeline {projectId} contactId={contact.id} />
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
        <h2 class="text-lg font-semibold text-ink">{$_('crm.contact.deleteTitle')}</h2>
      </div>
      <div class="p-6">
        <p class="text-sm text-ink-muted">
          {$_('crm.contact.deleteConfirm', { values: { name: contactName } })}
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
