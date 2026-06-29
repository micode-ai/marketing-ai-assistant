<script lang="ts">
  import { page } from '$app/stores';
  import { _, locale } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api/client';
  import { dealsApi, type Deal, type DealStage, type Forecast } from '$lib/api/crm-deals';
  import { scoreBand, bandClass } from '$lib/api/crm-score-band';
  import { formatMoney, columnTotal } from '$lib/api/crm-forecast';
  import { crmApi, type CrmContact, type CrmCompany } from '$lib/api/crm';
  import { loadActiveMembers, ownerName, type TeamMember } from '$lib/api/crm-owners';
  import { organizationIdStore } from '$lib/stores/projects';

  $: projectId = $page.params['id'];

  let stages: DealStage[] = [];
  let deals: Deal[] = [];
  let forecast: Forecast | null = null;
  let currency = 'USD';
  let loading = false;
  let mounted = false;
  let prevProjectId = '';
  let dragDealId: string | null = null;
  let hotFirst = false;

  // Team members for owner display
  let members: TeamMember[] = [];

  // Contact + company lists for the add modal
  let contacts: CrmContact[] = [];
  let companies: CrmCompany[] = [];

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
      const [s, d, f, proj] = await Promise.all([
        dealsApi.listStages(projectId),
        dealsApi.listDeals(projectId, { status: 'OPEN' }),
        dealsApi.forecast(projectId),
        api.get<any>(`/projects/${projectId}`),
      ]);
      stages = s; deals = d; forecast = f;
      currency = proj.baseCurrency || d[0]?.currency || 'USD';
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      loading = false;
    }
  }

  $: dealsByStage = (stageId: string) => deals.filter((x) => x.stageId === stageId);

  async function onDrop(stageId: string) {
    if (!dragDealId) return;
    const id = dragDealId; dragDealId = null;
    const deal = deals.find((x) => x.id === id);
    if (!deal || deal.stageId === stageId) return;
    const prev = deal.stageId;
    deal.stageId = stageId; deals = deals;            // optimistic
    try { await dealsApi.updateDeal(projectId, id, { stageId }); await refreshForecast(); }
    catch { deal.stageId = prev; deals = deals; }      // revert
  }

  async function refreshForecast() {
    if (projectId) forecast = await dealsApi.forecast(projectId);
  }

  async function win(id: string) {
    try {
      await dealsApi.winDeal(projectId, id);
      showToast($_('crm.deals.winSuccess'), 'success');
      await load();
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    }
  }

  // Lose modal state
  let showLoseModal = false;
  let loseDealId: string | null = null;
  let lostReason = '';

  function openLoseModal(id: string) {
    loseDealId = id;
    lostReason = '';
    showLoseModal = true;
  }

  async function confirmLose() {
    if (!loseDealId) return;
    try {
      await dealsApi.loseDeal(projectId, loseDealId, { lostReason: lostReason.trim() || undefined });
      showToast($_('crm.deals.loseSuccess'), 'success');
      showLoseModal = false;
      loseDealId = null;
      await load();
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    }
  }

  // Add deal modal
  let showAddModal = false;
  let addForm = {
    title: '',
    value: '',
    stageId: '',
    contactId: '',
    companyId: '',
    ownerId: '',
    expectedCloseDate: '',
  };
  let adding = false;

  async function openAddModal() {
    showAddModal = true;
    if (contacts.length === 0) {
      try {
        const res = await crmApi.listContacts(projectId, { pageSize: 100 });
        contacts = res.items;
      } catch { contacts = []; }
    }
    if (companies.length === 0) {
      try {
        const res = await crmApi.listCompanies(projectId);
        companies = res.items;
      } catch { companies = []; }
    }
  }

  async function addDeal() {
    if (!addForm.title.trim()) return;
    adding = true;
    try {
      await dealsApi.createDeal(projectId, {
        title: addForm.title.trim(),
        value: addForm.value ? parseFloat(addForm.value) : 0,
        stageId: addForm.stageId || null,
        contactId: addForm.contactId || null,
        companyId: addForm.companyId || null,
        ownerId: addForm.ownerId || null,
        expectedCloseDate: addForm.expectedCloseDate || null,
      });
      addForm = { title: '', value: '', stageId: '', contactId: '', companyId: '', ownerId: '', expectedCloseDate: '' };
      showAddModal = false;
      showToast($_('crm.deals.addSuccess'), 'success');
      await load();
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      adding = false;
    }
  }

  function handleAddModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showAddModal = false;
  }

  function handleLoseModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showLoseModal = false;
  }

  function contactDisplayName(c: CrmContact): string {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
    return name || c.email || c.id;
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
    load();
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
      class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors text-ink-muted hover:text-ink"
    >
      {$_('crm.nav.companies')}
    </a>
    <a
      href="/projects/{projectId}/crm/deals"
      class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors bg-surface text-ink shadow-sm"
      aria-current="page"
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
      <h1 class="text-2xl font-bold text-ink">{$_('crm.deals.title')}</h1>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={hotFirst}
        on:click={() => { hotFirst = !hotFirst; }}
        class="border px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 flex items-center gap-2 cursor-pointer
          {hotFirst ? 'bg-red-500/10 border-red-400 text-red-700' : 'border-border text-ink hover:bg-surface-2'}"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
        </svg>
        {$_('crm.insights.hotFirst')}
      </button>
      <a
        href="/projects/{projectId}/crm/deals/stages"
        class="border border-border text-ink px-3 py-2 rounded-lg text-sm font-medium hover:bg-surface-2 transition-colors duration-150 flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
        {$_('crm.pipeline.manageStages')}
      </a>
      <button
        on:click={openAddModal}
        class="bg-brand text-white px-3 py-2 rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('crm.deals.add')}
      </button>
    </div>
  </div>

  <!-- Forecast strip -->
  {#if forecast}
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
      <div class="bg-surface rounded-xl border border-border p-4">
        <p class="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">{$_('crm.pipeline.forecast.weighted')}</p>
        <p class="text-xl font-bold text-ink">{formatMoney(forecast.weightedValue, currency, $locale ?? 'en')}</p>
      </div>
      <div class="bg-surface rounded-xl border border-border p-4">
        <p class="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">{$_('crm.pipeline.forecast.open')}</p>
        <p class="text-xl font-bold text-ink">{formatMoney(forecast.openValue, currency, $locale ?? 'en')}</p>
        <p class="text-xs text-ink-muted mt-1">{$_('crm.deals.openCount', { values: { count: forecast.openCount } })}</p>
      </div>
      <div class="bg-surface rounded-xl border border-border p-4 col-span-2 sm:col-span-1">
        <p class="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">{$_('crm.pipeline.forecast.won')}</p>
        <p class="text-xl font-bold text-green-600">{formatMoney(forecast.wonValuePeriod, currency, $locale ?? 'en')}</p>
      </div>
    </div>
  {/if}

  {#if loading}
    <!-- Loading skeleton -->
    <div class="flex gap-4 overflow-x-auto pb-4">
      {#each Array(3) as _}
        <div class="flex-shrink-0 w-72 bg-surface rounded-xl border border-border animate-pulse">
          <div class="p-3 border-b border-border">
            <div class="h-4 bg-surface-2 rounded w-1/2 mb-2"></div>
            <div class="h-3 bg-surface-2 rounded w-1/3"></div>
          </div>
          {#each Array(3) as __}
            <div class="p-3 border-b border-border">
              <div class="h-4 bg-surface-2 rounded w-3/4 mb-2"></div>
              <div class="h-3 bg-surface-2 rounded w-1/2"></div>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {:else if stages.length === 0}
    <!-- Empty state: no stages -->
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-20 h-20 bg-brand-subtle/10 rounded-2xl flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-ink mb-2">{$_('crm.deals.empty')}</h2>
      <p class="text-ink-muted mb-6 max-w-sm text-sm">{$_('crm.deals.emptyHint')}</p>
      <a
        href="/projects/{projectId}/crm/deals/stages"
        class="bg-brand text-white px-6 py-3 rounded-xl font-medium hover:brightness-110 transition-colors duration-150 flex items-center gap-2"
      >
        {$_('crm.pipeline.manageStages')}
      </a>
    </div>
  {:else}
    <!-- Kanban board -->
    <div class="flex gap-4 overflow-x-auto pb-6 min-h-[480px]">
      {#each stages as stage (stage.id)}
        {@const stageDeals = hotFirst
          ? dealsByStage(stage.id).slice().sort((a, b) => (b.insight?.score ?? -1) - (a.insight?.score ?? -1))
          : dealsByStage(stage.id)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="flex-shrink-0 w-72 flex flex-col bg-surface-2/50 rounded-xl border border-border"
          on:dragover|preventDefault
          on:drop={() => onDrop(stage.id)}
        >
          <!-- Column header -->
          <div class="p-3 border-b border-border bg-surface rounded-t-xl">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-ink truncate">{stage.name}</h3>
              <span class="ml-2 flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-surface-2 text-ink-muted font-medium">{stageDeals.length}</span>
            </div>
            {#if stageDeals.length > 0}
              <p class="text-xs text-ink-muted mt-0.5">{formatMoney(columnTotal(stageDeals), currency, $locale ?? 'en')}</p>
            {/if}
          </div>

          <!-- Deal cards -->
          <div class="flex-1 p-2 flex flex-col gap-2 min-h-[120px]">
            {#each stageDeals as deal (deal.id)}
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                draggable="true"
                on:dragstart={() => { dragDealId = deal.id; }}
                class="bg-surface rounded-lg border border-border p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow duration-150 group"
              >
                <!-- Title + score badge -->
                <div class="flex items-start justify-between gap-2 mb-2">
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <div
                    class="text-sm font-medium text-ink hover:text-brand transition-colors cursor-pointer flex-1 min-w-0"
                    on:click={() => goto(`/projects/${projectId}/crm/deals/${deal.id}`)}
                  >
                    {deal.title}
                  </div>
                  {#if deal.insight?.score != null}
                    {@const band = scoreBand(deal.insight.score)}
                    {#if band}
                      <span class="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-semibold leading-5 {bandClass(band)}">
                        {deal.insight.score}
                      </span>
                    {/if}
                  {/if}
                </div>

                <!-- Value -->
                <p class="text-base font-bold text-ink mb-2">{formatMoney(deal.value, deal.currency || currency, $locale ?? 'en')}</p>

                <!-- Company / Contact -->
                {#if deal.company?.name}
                  <p class="text-xs text-ink-muted flex items-center gap-1 mb-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                    </svg>
                    {deal.company.name}
                  </p>
                {/if}
                {#if deal.contact}
                  <p class="text-xs text-ink-muted flex items-center gap-1 mb-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                    {[deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(' ') || deal.contact.email || ''}
                  </p>
                {/if}

                <!-- Owner -->
                {#if deal.ownerId}
                  <p class="text-xs text-ink-subtle mt-1">{ownerName(members, deal.ownerId, $_('crm.unassigned'))}</p>
                {/if}

                <!-- Win / Lose actions -->
                <div class="flex items-center gap-1 mt-2 pt-2 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <button
                    on:click|stopPropagation={() => win(deal.id)}
                    class="flex-1 text-xs py-1 rounded-md bg-green-500/10 text-green-700 hover:bg-green-500/20 transition-colors font-medium cursor-pointer"
                  >
                    {$_('crm.deals.win')}
                  </button>
                  <button
                    on:click|stopPropagation={() => openLoseModal(deal.id)}
                    class="flex-1 text-xs py-1 rounded-md bg-red-500/10 text-red-700 hover:bg-red-500/20 transition-colors font-medium cursor-pointer"
                  >
                    {$_('crm.deals.lose')}
                  </button>
                </div>
              </div>
            {/each}

            <!-- Column empty hint -->
            {#if stageDeals.length === 0}
              <div class="flex items-center justify-center h-20 rounded-lg border-2 border-dashed border-border text-xs text-ink-subtle">
                {$_('crm.deals.dropHere')}
              </div>
            {/if}
          </div>

          <!-- Add deal to this stage -->
          <div class="p-2 border-t border-border">
            <button
              on:click={() => { addForm.stageId = stage.id; openAddModal(); }}
              class="w-full flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink px-2 py-1.5 rounded-md hover:bg-surface transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {$_('crm.deals.add')}
            </button>
          </div>
        </div>
      {/each}
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

<!-- Add Deal Modal -->
{#if showAddModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    on:click|self={() => (showAddModal = false)}
    on:keydown={handleAddModalKeydown}
  >
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
      <div class="p-6 border-b border-border flex items-center gap-2.5">
        <div class="w-8 h-8 bg-brand-subtle/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('crm.deals.add')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <!-- Title -->
        <div>
          <label for="deal-title" class="block text-sm font-medium text-ink mb-1.5">{$_('crm.deals.form.title')}</label>
          <input
            id="deal-title"
            type="text"
            bind:value={addForm.title}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
            placeholder="Enterprise contract Q3"
          />
        </div>

        <!-- Value -->
        <div>
          <label for="deal-value" class="block text-sm font-medium text-ink mb-1.5">{$_('crm.deals.value')}</label>
          <input
            id="deal-value"
            type="number"
            min="0"
            bind:value={addForm.value}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
            placeholder="5000"
          />
        </div>

        <!-- Stage -->
        <div>
          <label for="deal-stage" class="block text-sm font-medium text-ink mb-1.5">{$_('crm.deals.stage')}</label>
          <select
            id="deal-stage"
            bind:value={addForm.stageId}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
          >
            <option value="">{$_('common.optional')}</option>
            {#each stages as s (s.id)}
              <option value={s.id}>{s.name}</option>
            {/each}
          </select>
        </div>

        <!-- Contact -->
        <div>
          <label for="deal-contact" class="block text-sm font-medium text-ink mb-1.5">{$_('crm.deals.contact')}</label>
          <select
            id="deal-contact"
            bind:value={addForm.contactId}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
          >
            <option value="">{$_('common.optional')}</option>
            {#each contacts as c (c.id)}
              <option value={c.id}>{contactDisplayName(c)}</option>
            {/each}
          </select>
        </div>

        <!-- Company -->
        <div>
          <label for="deal-company" class="block text-sm font-medium text-ink mb-1.5">{$_('crm.deals.company')}</label>
          <select
            id="deal-company"
            bind:value={addForm.companyId}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
          >
            <option value="">{$_('common.optional')}</option>
            {#each companies as co (co.id)}
              <option value={co.id}>{co.name}</option>
            {/each}
          </select>
        </div>

        <!-- Owner -->
        <div>
          <label for="deal-owner" class="block text-sm font-medium text-ink mb-1.5">{$_('crm.deals.owner')}</label>
          <select
            id="deal-owner"
            bind:value={addForm.ownerId}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
          >
            <option value="">{$_('crm.unassigned')}</option>
            {#each members as m (m.userId)}
              <option value={m.userId}>{m.name}</option>
            {/each}
          </select>
        </div>

        <!-- Expected close date -->
        <div>
          <label for="deal-close" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.deals.expectedClose')}
            <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
          </label>
          <input
            id="deal-close"
            type="date"
            bind:value={addForm.expectedCloseDate}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
          />
        </div>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={addDeal}
          disabled={adding || !addForm.title.trim()}
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
            {$_('crm.deals.add')}
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

<!-- Lose Deal Modal -->
{#if showLoseModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    on:click|self={() => (showLoseModal = false)}
    on:keydown={handleLoseModalKeydown}
  >
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-sm">
      <div class="p-6 border-b border-border">
        <h2 class="text-lg font-semibold text-ink">{$_('crm.deals.loseTitle')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="lose-reason" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.deals.lostReasonPrompt')}
            <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
          </label>
          <input
            id="lose-reason"
            type="text"
            bind:value={lostReason}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
            placeholder="Price, timing, competitor..."
          />
        </div>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={confirmLose}
          class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 text-sm cursor-pointer"
        >
          {$_('crm.deals.lose')}
        </button>
        <button
          on:click={() => (showLoseModal = false)}
          class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
