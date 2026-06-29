<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { dealsApi, type Deal, type DealStage } from '$lib/api/crm-deals';
  import { crmApi } from '$lib/api/crm';
  import { loadActiveMembers, type TeamMember } from '$lib/api/crm-owners';
  import { organizationIdStore } from '$lib/stores/projects';
  import CrmTimeline from '$lib/components/crm/CrmTimeline.svelte';

  $: projectId = $page.params['id'];
  $: dealId = $page.params['dealId'];

  interface ContactItem { id: string; firstName: string | null; lastName: string | null; email: string | null; }
  interface CompanyItem { id: string; name: string; }

  let deal: Deal | null = null;
  let loading = true;
  let saving = false;
  let mounted = false;
  let prevProjectId = '';

  // Form fields
  let title = '';
  let value = '';
  let stageId = '';
  let expectedCloseDate = '';
  let ownerId = '';
  let contactId = '';
  let companyId = '';

  // Lookup data
  let stages: DealStage[] = [];
  let contacts: ContactItem[] = [];
  let companies: CompanyItem[] = [];
  let members: TeamMember[] = [];

  // Modals
  let showDeleteModal = false;
  let deleting = false;
  let showLoseModal = false;
  let loseReason = '';
  let losingDeal = false;

  // Toast
  let toast: { message: string; type: 'success' | 'error' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message, type };
    toastTimer = setTimeout(() => { toast = null; }, 5000);
  }

  function dateToInput(iso: string | null): string {
    if (!iso) return '';
    return iso.substring(0, 10);
  }

  function contactLabel(c: ContactItem): string {
    const parts = [c.firstName, c.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : (c.email ?? c.id);
  }

  function populateForm(d: Deal) {
    title = d.title ?? '';
    value = d.value != null ? String(d.value) : '';
    stageId = d.stageId ?? '';
    expectedCloseDate = dateToInput(d.expectedCloseDate);
    ownerId = d.ownerId ?? '';
    contactId = d.contactId ?? '';
    companyId = d.companyId ?? '';
  }

  async function load() {
    if (!projectId || !dealId) return;
    loading = true;
    try {
      deal = await dealsApi.getDeal(projectId, dealId);
      populateForm(deal);
    } catch (e: unknown) {
      showToast((e as Error).message || $_('crm.deal.loadError'), 'error');
    } finally {
      loading = false;
    }
  }

  async function loadLookups() {
    try {
      const [stagesRes, contactsRes, companiesRes] = await Promise.all([
        dealsApi.listStages(projectId),
        crmApi.listContacts(projectId, { pageSize: 200 }),
        crmApi.listCompanies(projectId),
      ]);
      stages = stagesRes;
      contacts = contactsRes.items as ContactItem[];
      companies = companiesRes.items as CompanyItem[];
    } catch {
      // non-critical — selects remain empty if lookup fails
    }
  }

  onMount(async () => {
    mounted = true;
    prevProjectId = projectId;
    if ($organizationIdStore) {
      loadActiveMembers($organizationIdStore).then((m) => { members = m; });
    }
    await Promise.all([load(), loadLookups()]);
  });

  // Project-switch guard: redirect to new project's deals list
  $: if (mounted && projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    goto(`/projects/${projectId}/crm/deals`);
  }

  // Dirty detection — all dependencies listed directly for Svelte reactivity tracking
  $: isDirty =
    deal !== null &&
    (title !== (deal.title ?? '') ||
      value !== (deal.value != null ? String(deal.value) : '') ||
      stageId !== (deal.stageId ?? '') ||
      expectedCloseDate !== dateToInput(deal.expectedCloseDate) ||
      ownerId !== (deal.ownerId ?? '') ||
      contactId !== (deal.contactId ?? '') ||
      companyId !== (deal.companyId ?? ''));

  function computePatch(): Record<string, unknown> {
    if (!deal) return {};
    const patch: Record<string, unknown> = {};
    if (title !== (deal.title ?? '')) patch.title = title;
    if (value !== (deal.value != null ? String(deal.value) : '')) {
      patch.value = value !== '' ? parseFloat(value) || 0 : 0;
    }
    if (stageId !== (deal.stageId ?? '')) patch.stageId = stageId || null;
    if (expectedCloseDate !== dateToInput(deal.expectedCloseDate)) {
      patch.expectedCloseDate = expectedCloseDate || null;
    }
    if (ownerId !== (deal.ownerId ?? '')) patch.ownerId = ownerId || null;
    if (contactId !== (deal.contactId ?? '')) patch.contactId = contactId || null;
    if (companyId !== (deal.companyId ?? '')) patch.companyId = companyId || null;
    return patch;
  }

  async function save() {
    if (!deal || !projectId || !dealId || !isDirty) return;
    const patch = computePatch();
    saving = true;
    try {
      deal = await dealsApi.updateDeal(projectId, dealId, patch);
      populateForm(deal);
      showToast($_('crm.deal.saveSuccess'), 'success');
    } catch (e: unknown) {
      showToast((e as Error).message || $_('crm.deal.saveError'), 'error');
    } finally {
      saving = false;
    }
  }

  async function doWin() {
    if (!projectId || !dealId || !deal) return;
    saving = true;
    try {
      deal = await dealsApi.winDeal(projectId, dealId);
      populateForm(deal);
      showToast($_('crm.deals.winSuccess'), 'success');
    } catch (e: unknown) {
      showToast((e as Error).message || $_('crm.deal.winError'), 'error');
    } finally {
      saving = false;
    }
  }

  async function confirmLose() {
    if (!projectId || !dealId || !deal) return;
    losingDeal = true;
    try {
      deal = await dealsApi.loseDeal(projectId, dealId, { lostReason: loseReason || undefined });
      populateForm(deal);
      showLoseModal = false;
      loseReason = '';
      showToast($_('crm.deals.loseSuccess'), 'success');
    } catch (e: unknown) {
      showToast((e as Error).message || $_('crm.deal.loseError'), 'error');
    } finally {
      losingDeal = false;
    }
  }

  async function doReopen() {
    if (!projectId || !dealId || !deal) return;
    saving = true;
    try {
      deal = await dealsApi.reopenDeal(projectId, dealId);
      populateForm(deal);
      showToast($_('crm.deal.reopenSuccess'), 'success');
    } catch (e: unknown) {
      showToast((e as Error).message || $_('crm.deal.reopenError'), 'error');
    } finally {
      saving = false;
    }
  }

  async function confirmDelete() {
    if (!projectId || !dealId) return;
    deleting = true;
    try {
      await dealsApi.deleteDeal(projectId, dealId);
      goto(`/projects/${projectId}/crm/deals`);
    } catch (e: unknown) {
      showToast((e as Error).message || $_('crm.deal.deleteError'), 'error');
      deleting = false;
      showDeleteModal = false;
    }
  }

  function handleDeleteModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showDeleteModal = false;
  }

  function handleLoseModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showLoseModal = false;
  }

  const statusColors: Record<string, string> = {
    OPEN: 'bg-blue-500/20 text-blue-700',
    WON: 'bg-green-500/20 text-green-700',
    LOST: 'bg-red-500/20 text-red-700',
  };
</script>

<div class="p-4 sm:p-6 max-w-5xl mx-auto">
  <!-- Back link + header -->
  <div class="mb-6">
    <a
      href="/projects/{projectId}/crm/deals"
      class="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors mb-3"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
      </svg>
      {$_('crm.deal.backToList')}
    </a>

    {#if loading}
      <div class="h-8 w-56 bg-surface-2 rounded-lg animate-pulse"></div>
    {:else if deal}
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <h1 class="text-2xl font-bold text-ink">{deal.title}</h1>
        <span class="text-xs px-2.5 py-1 rounded-full font-medium w-fit {statusColors[deal.status] ?? 'bg-surface-2 text-ink-muted'}">
          {$_(`crm.deals.status.${deal.status}`, { default: deal.status })}
        </span>
      </div>
    {:else}
      <h1 class="text-2xl font-bold text-ink">{$_('crm.deal.title')}</h1>
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
          <div class="h-4 bg-surface-2 rounded w-2/3"></div>
        </div>
      </div>
    </div>
  {:else if !deal}
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <p class="text-ink-muted">{$_('crm.deal.notFound')}</p>
      <a
        href="/projects/{projectId}/crm/deals"
        class="mt-4 text-sm text-brand hover:underline"
      >
        {$_('crm.deal.backToList')}
      </a>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left column: deal info + save -->
      <div class="lg:col-span-2 space-y-5">

        <!-- Deal Info card -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('crm.deal.info')}</h2>
          </div>
          <div class="p-5 space-y-4">
            <!-- Title -->
            <div>
              <label for="deal-title" class="block text-sm font-medium text-ink mb-1.5">
                {$_('crm.deal.titleLabel')}
              </label>
              <input
                id="deal-title"
                type="text"
                bind:value={title}
                placeholder={$_('crm.deal.titlePlaceholder')}
                class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
              />
            </div>

            <!-- Value + Stage -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="deal-value" class="block text-sm font-medium text-ink mb-1.5">
                  {$_('crm.deals.value')}
                </label>
                <div class="relative">
                  <input
                    id="deal-value"
                    type="number"
                    min="0"
                    step="0.01"
                    bind:value
                    placeholder="0.00"
                    class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink pr-14"
                  />
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted font-medium select-none pointer-events-none">
                    {deal.currency}
                  </span>
                </div>
              </div>
              <div>
                <label for="deal-stage" class="block text-sm font-medium text-ink mb-1.5">
                  {$_('crm.deals.stage')}
                </label>
                <select
                  id="deal-stage"
                  bind:value={stageId}
                  class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink cursor-pointer"
                >
                  <option value="">{$_('crm.deal.noStage')}</option>
                  {#each stages as s (s.id)}
                    <option value={s.id}>{s.name}</option>
                  {/each}
                </select>
              </div>
            </div>

            <!-- Expected Close Date -->
            <div>
              <label for="deal-close" class="block text-sm font-medium text-ink mb-1.5">
                {$_('crm.deals.expectedClose')}
              </label>
              <input
                id="deal-close"
                type="date"
                bind:value={expectedCloseDate}
                class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink cursor-pointer"
              />
            </div>
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
              {$_('crm.deal.saving')}
            {:else}
              {$_('crm.deal.save')}
            {/if}
          </button>
        </div>
      </div>

      <!-- Right column: details + finance indicator + actions -->
      <div class="space-y-5">

        <!-- Details card: owner, contact, company -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('crm.deal.details')}</h2>
          </div>
          <div class="p-5 space-y-4">
            <!-- Owner picker -->
            <div>
              <label for="deal-owner" class="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
                {$_('crm.deals.owner')}
              </label>
              <select
                id="deal-owner"
                bind:value={ownerId}
                class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink cursor-pointer"
              >
                <option value="">{$_('crm.unassigned')}</option>
                {#each members as member (member.userId)}
                  <option value={member.userId}>{member.name}</option>
                {/each}
              </select>
            </div>

            <!-- Contact selector -->
            <div>
              <label for="deal-contact" class="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
                {$_('crm.deals.contact')}
              </label>
              <select
                id="deal-contact"
                bind:value={contactId}
                class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink cursor-pointer"
              >
                <option value="">{$_('crm.deal.noContact')}</option>
                {#each contacts as c (c.id)}
                  <option value={c.id}>{contactLabel(c)}</option>
                {/each}
              </select>
            </div>

            <!-- Company selector -->
            <div>
              <label for="deal-company" class="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
                {$_('crm.deals.company')}
              </label>
              <select
                id="deal-company"
                bind:value={companyId}
                class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink cursor-pointer"
              >
                <option value="">{$_('crm.deal.noCompany')}</option>
                {#each companies as co (co.id)}
                  <option value={co.id}>{co.name}</option>
                {/each}
              </select>
            </div>
          </div>
        </div>

        <!-- Finance indicator (shown when financeRecordId is set) -->
        {#if deal.financeRecordId}
          <div class="bg-surface rounded-xl border border-border">
            <div class="p-5 flex items-start gap-3">
              <div class="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-green-700">{$_('crm.deal.incomeBooked')}</p>
                <a
                  href="/projects/{projectId}/finances"
                  class="text-xs text-brand hover:underline mt-0.5 inline-block"
                >
                  {$_('crm.deal.viewFinances')}
                </a>
              </div>
            </div>
          </div>
        {/if}

        <!-- Status + Actions card -->
        <div class="bg-surface rounded-xl border border-border">
          <div class="px-5 py-4 border-b border-border">
            <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{$_('common.actions')}</h2>
          </div>
          <div class="p-5 space-y-3">
            <!-- Status badge -->
            <div class="flex items-center gap-2 pb-1">
              <span class="text-xs font-medium text-ink-muted uppercase tracking-wider">{$_('common.status')}</span>
              <span class="text-xs px-2.5 py-1 rounded-full font-medium {statusColors[deal.status] ?? 'bg-surface-2 text-ink-muted'}">
                {$_(`crm.deals.status.${deal.status}`, { default: deal.status })}
              </span>
            </div>

            <!-- Status-dependent actions -->
            {#if deal.status === 'OPEN'}
              <button
                type="button"
                on:click={doWin}
                disabled={saving}
                class="w-full border border-green-400 text-green-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-400/10 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
              >
                {$_('crm.deals.win')}
              </button>
              <button
                type="button"
                on:click={() => (showLoseModal = true)}
                disabled={saving}
                class="w-full border border-amber-400 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400/10 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
              >
                {$_('crm.deals.lose')}
              </button>
            {:else if deal.status === 'WON' || deal.status === 'LOST'}
              <button
                type="button"
                on:click={doReopen}
                disabled={saving}
                class="w-full border border-blue-300 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-400/10 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
              >
                {$_('crm.deals.reopen')}
              </button>
            {/if}

            <button
              type="button"
              on:click={() => (showDeleteModal = true)}
              disabled={saving}
              class="w-full border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-400/10 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
            >
              {$_('crm.deal.delete')}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline section -->
    <div class="mt-8">
      <CrmTimeline {projectId} dealId={deal.id} />
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

<!-- Lose deal modal -->
{#if showLoseModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    on:click|self={() => (showLoseModal = false)}
    on:keydown={handleLoseModalKeydown}
  >
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-border flex items-center gap-3">
        <div class="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('crm.deals.loseTitle')}</h2>
      </div>
      <div class="p-6">
        <label for="lose-reason" class="block text-sm font-medium text-ink mb-1.5">
          {$_('crm.deals.lostReasonPrompt')}
          <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
        </label>
        <textarea
          id="lose-reason"
          bind:value={loseReason}
          rows={3}
          placeholder={$_('crm.deal.loseReasonPlaceholder')}
          class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink resize-none"
        ></textarea>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={confirmLose}
          disabled={losingDeal}
          class="flex-1 bg-amber-600 text-white py-2.5 rounded-lg font-medium hover:bg-amber-700 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if losingDeal}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          {/if}
          {$_('crm.deals.lose')}
        </button>
        <button
          on:click={() => (showLoseModal = false)}
          disabled={losingDeal}
          class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer disabled:opacity-50"
        >
          {$_('common.cancel')}
        </button>
      </div>
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
        <h2 class="text-lg font-semibold text-ink">{$_('crm.deal.deleteTitle')}</h2>
      </div>
      <div class="p-6">
        <p class="text-sm text-ink-muted">
          {$_('crm.deal.deleteConfirm', { values: { title: deal?.title ?? '' } })}
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
