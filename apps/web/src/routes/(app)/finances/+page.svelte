<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy, tick } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore, currentProjectStore } from '$lib/stores/projects';
  import { contextStore } from '$lib/stores/context';

  // If project selected, redirect to project finances
  $: if ($currentProjectStore) {
    goto(`/projects/${$currentProjectStore.id}/finances`, { replaceState: true });
  }

  const SUPPORTED_CURRENCIES = ['USD','EUR','GBP','PLN','RUB','UAH','BYN','KZT','TRY','JPY','CNY'];

  let loading = true;
  let records: any[] = [];
  let totalRecords = 0;
  let currentPage = 1;
  const pageLimit = 20;
  let summary: any = null;
  let categories: any[] = [];
  let baseCurrency = 'USD';

  let periodMode: 'month' | 'quarter' | 'year' | 'custom' = 'year';
  let customDateFrom = '';
  let customDateTo = '';
  let filterType: 'ALL' | 'INCOME' | 'EXPENSE' = 'ALL';
  let filterCategoryId = '';

  let ChartJS: any = null;
  let barCanvas: HTMLCanvasElement;
  let doughnutCanvas: HTMLCanvasElement;
  let barChart: any = null;
  let doughnutChart: any = null;
  let doughnutMode: 'EXPENSE' | 'INCOME' = 'EXPENSE';

  // Record modal
  let showRecordModal = false;
  let editingRecord: any = null;
  let recordSaving = false;
  let recordForm = {
    type: 'EXPENSE' as 'EXPENSE' | 'INCOME',
    categoryId: '',
    amount: '' as string | number,
    currency: 'USD',
    description: '',
    date: new Date().toISOString().substring(0, 10),
  };

  // Categories modal
  let showCategoriesModal = false;
  let newCatName = '';
  let newCatType: 'EXPENSE' | 'INCOME' = 'EXPENSE';
  let newCatColor = '#6366F1';
  let catSaving = false;

  let deletingId: string | null = null;

  $: orgId = $organizationIdStore;

  function getDateRange(): { dateFrom: string; dateTo: string } {
    const now = new Date();
    const to = now.toISOString().substring(0, 10);
    let from: string;
    if (periodMode === 'month') { const d = new Date(now); d.setDate(d.getDate() - 30); from = d.toISOString().substring(0, 10); }
    else if (periodMode === 'quarter') { const d = new Date(now); d.setDate(d.getDate() - 90); from = d.toISOString().substring(0, 10); }
    else if (periodMode === 'year') { const d = new Date(now); d.setDate(d.getDate() - 365); from = d.toISOString().substring(0, 10); }
    else { from = customDateFrom || to; return { dateFrom: from, dateTo: customDateTo || to }; }
    return { dateFrom: from, dateTo: to };
  }

  function getCategoryName(cat: any): string {
    if (!cat) return '';
    const key = cat.name || cat.categoryName || '';
    const translated = $_(key);
    return translated === key ? key : translated;
  }

  function formatCurrency(amount: number, currency?: string): string {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || baseCurrency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    } catch { return `${amount.toFixed(2)} ${currency || baseCurrency}`; }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  async function fetchAll() {
    if (!orgId || $currentProjectStore) return;
    loading = true;
    try { await Promise.all([fetchSummary(), fetchRecords(), fetchCategories()]); }
    finally { loading = false; }
    if (ChartJS && summary) { await tick(); requestAnimationFrame(() => renderCharts()); }
  }

  async function fetchSummary() {
    const { dateFrom, dateTo } = getDateRange();
    try {
      summary = await api.get<any>('/finances/summary', { organizationId: orgId, aggregated: 'true', dateFrom, dateTo });
      if (summary?.baseCurrency) baseCurrency = summary.baseCurrency;
    } catch (e) { console.error('Failed to load summary:', e); }
  }

  async function fetchRecords() {
    const { dateFrom, dateTo } = getDateRange();
    const params: any = { organizationId: orgId, aggregated: 'true', dateFrom, dateTo, page: currentPage, limit: pageLimit };
    if (filterType !== 'ALL') params.type = filterType;
    if (filterCategoryId) params.categoryId = filterCategoryId;
    try {
      const res = await api.get<any>('/finances', params);
      records = res.data || [];
      totalRecords = res.total || 0;
    } catch (e) { console.error('Failed to load records:', e); records = []; }
  }

  async function fetchCategories() {
    try { categories = await api.get<any[]>('/finances/categories', { organizationId: orgId }); }
    catch (e) { console.error('Failed to load categories:', e); }
  }

  // Charts
  function destroyCharts() { barChart?.destroy(); barChart = null; doughnutChart?.destroy(); doughnutChart = null; }

  function renderCharts() {
    if (!ChartJS || !summary) return;
    renderBarChart();
    renderDoughnutChart();
  }

  function renderBarChart() {
    if (!barCanvas?.getContext('2d') || !summary?.monthly?.length) return;
    barChart?.destroy();
    barChart = new ChartJS(barCanvas, {
      type: 'bar',
      data: {
        labels: summary.monthly.map((m: any) => m.month),
        datasets: [
          { label: $_('finances.income'), data: summary.monthly.map((m: any) => m.income), backgroundColor: 'rgba(34,197,94,0.6)' },
          { label: $_('finances.expenses'), data: summary.monthly.map((m: any) => m.expense), backgroundColor: 'rgba(239,68,68,0.6)' },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
    });
  }

  function renderDoughnutChart() {
    if (!doughnutCanvas?.getContext('2d') || !summary?.byCategory) return;
    const byCategory = (summary.byCategory || []).filter((c: any) => c.type === doughnutMode);
    if (byCategory.length === 0) return;
    doughnutChart?.destroy();
    doughnutChart = new ChartJS(doughnutCanvas, {
      type: 'doughnut',
      data: {
        labels: byCategory.map((c: any) => { const n = c.categoryName || c.name || ''; const t = $_(n); return t === n ? n : t; }),
        datasets: [{ data: byCategory.map((c: any) => c.total), backgroundColor: byCategory.map((c: any) => c.categoryColor || c.color || '#6366F1') }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8 } } } },
    });
  }

  function toggleDoughnut() { doughnutMode = doughnutMode === 'EXPENSE' ? 'INCOME' : 'EXPENSE'; renderDoughnutChart(); }

  // CRUD
  function openAddModal() {
    editingRecord = null;
    recordForm = { type: 'EXPENSE', categoryId: '', amount: '', currency: baseCurrency, description: '', date: new Date().toISOString().substring(0, 10) };
    showRecordModal = true;
  }

  function openEditModal(record: any) {
    editingRecord = record;
    recordForm = { type: record.type, categoryId: record.categoryId, amount: record.amount, currency: record.currency, description: record.description || '', date: record.date?.substring(0, 10) };
    showRecordModal = true;
  }

  async function saveRecord() {
    if (recordSaving) return;
    recordSaving = true;
    try {
      const body: any = { ...recordForm, amount: Number(recordForm.amount) };
      // Org-level record (no projectId)
      if (editingRecord) {
        await api.put(`/finances/${editingRecord.id}`, body);
      } else {
        await api.post('/finances', body);
      }
      showRecordModal = false;
      await fetchAll();
    } catch (e) { console.error('Save failed:', e); }
    finally { recordSaving = false; }
  }

  async function deleteRecord(id: string) {
    try { await api.delete(`/finances/${id}`); deletingId = null; await fetchAll(); }
    catch (e) { console.error('Delete failed:', e); }
  }

  async function addCategory() {
    if (catSaving || !newCatName.trim()) return;
    catSaving = true;
    try {
      await api.post('/finances/categories', { name: newCatName.trim(), type: newCatType, color: newCatColor });
      newCatName = '';
      await fetchCategories();
    } catch (e) { console.error('Failed to add category:', e); }
    finally { catSaving = false; }
  }

  async function deleteCategoryById(id: string) {
    try { await api.delete(`/finances/categories/${id}`); await fetchCategories(); }
    catch (e) { console.error('Failed to delete category:', e); }
  }

  $: filteredCategories = categories.filter((c: any) =>
    recordForm.type === 'EXPENSE'
      ? c.type === 'EXPENSE' || c.type === 'BOTH'
      : c.type === 'INCOME' || c.type === 'BOTH'
  );

  $: totalPages = Math.ceil(totalRecords / pageLimit);

  onMount(async () => {
    const { Chart } = await import('chart.js/auto');
    ChartJS = Chart;
    if (!$currentProjectStore) await fetchAll();
  });

  onDestroy(() => { destroyCharts(); });

  $: periodMode, filterType, filterCategoryId, (() => { if (ChartJS && orgId && !$currentProjectStore) fetchAll(); })();
</script>

{#if !$currentProjectStore}
<div class="p-4 sm:p-6">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-white">{$_('finances.title')}</h1>
      <p class="text-sm text-gray-400 mt-1">{$_('finances.subtitle')}</p>
    </div>
    <div class="flex items-center gap-3">
      <div class="flex bg-gray-800 rounded-lg overflow-hidden text-sm">
        {#each ['month', 'quarter', 'year'] as p}
          <button
            class="px-3 py-1.5 {periodMode === p ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'}"
            on:click={() => { periodMode = p; }}
          >{$_(`finances.${p}`)}</button>
        {/each}
      </div>
      <button on:click={openAddModal} class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
        + {$_('finances.addRecord')}
      </button>
    </div>
  </div>

  {#if loading}
    <div class="flex justify-center py-16"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>
  {:else}
    <!-- Summary Cards -->
    {#if summary}
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="bg-green-500/10 border border-green-500/25 rounded-xl p-4">
        <div class="text-xs text-gray-400">{$_('finances.income')}</div>
        <div class="text-2xl font-bold text-green-400 mt-1">{formatCurrency(summary.totalIncome)}</div>
      </div>
      <div class="bg-red-500/10 border border-red-500/25 rounded-xl p-4">
        <div class="text-xs text-gray-400">{$_('finances.expenses')}</div>
        <div class="text-2xl font-bold text-red-400 mt-1">{formatCurrency(summary.totalExpense)}</div>
      </div>
      <div class="bg-indigo-500/10 border border-indigo-500/25 rounded-xl p-4">
        <div class="text-xs text-gray-400">{$_('finances.profit')}</div>
        <div class="text-2xl font-bold text-indigo-400 mt-1">{formatCurrency(summary.profit)}</div>
      </div>
    </div>
    {/if}

    <!-- Charts -->
    {#if summary?.monthly?.length > 0 || summary?.byCategory?.length > 0}
    <div class="grid grid-cols-5 gap-4 mb-6">
      <div class="col-span-3 bg-gray-800 rounded-xl p-4" style="min-height: 250px">
        <h3 class="text-sm font-semibold mb-3">{$_('finances.incomeVsExpenses')}</h3>
        <div style="height: 200px"><canvas bind:this={barCanvas}></canvas></div>
      </div>
      <div class="col-span-2 bg-gray-800 rounded-xl p-4" style="min-height: 250px">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold">{$_('finances.byCategory')}</h3>
          <button on:click={toggleDoughnut} class="text-xs px-2 py-1 rounded {doughnutMode === 'EXPENSE' ? 'text-red-400 bg-red-500/10' : 'text-green-400 bg-green-500/10'}">
            {doughnutMode === 'EXPENSE' ? $_('finances.expenses') : $_('finances.income')}
          </button>
        </div>
        <div style="height: 200px"><canvas bind:this={doughnutCanvas}></canvas></div>
      </div>
    </div>
    {/if}

    <!-- Table -->
    <div class="bg-gray-800 rounded-xl overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div class="flex gap-2 text-sm">
          {#each ['ALL', 'INCOME', 'EXPENSE'] as t}
            <button class="px-3 py-1 rounded {filterType === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}" on:click={() => { filterType = t; }}>
              {t === 'ALL' ? $_('finances.all') : t === 'INCOME' ? $_('finances.income') : $_('finances.expenses')}
            </button>
          {/each}
        </div>
        <button on:click={() => showCategoriesModal = true} class="text-sm text-indigo-400 hover:text-indigo-300">{$_('finances.manageCategories')}</button>
      </div>

      {#if records.length === 0}
        <div class="text-center py-12 text-gray-500">{$_('finances.emptyState')}</div>
      {:else}
        <table class="w-full text-sm">
          <thead class="text-xs text-gray-500 border-b border-gray-700">
            <tr><th class="px-4 py-2 text-left">{$_('finances.date')}</th><th class="px-4 py-2 text-left">{$_('finances.type')}</th><th class="px-4 py-2 text-left">{$_('finances.category')}</th><th class="px-4 py-2 text-left">Project</th><th class="px-4 py-2 text-left">{$_('finances.description')}</th><th class="px-4 py-2 text-right">{$_('finances.amount')}</th><th class="w-20"></th></tr>
          </thead>
          <tbody>
            {#each records as record}
              <tr class="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td class="px-4 py-2.5 text-gray-400">{formatDate(record.date)}</td>
                <td class="px-4 py-2.5">
                  <span class="px-2 py-0.5 rounded text-xs {record.type === 'INCOME' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}">
                    {record.type === 'INCOME' ? $_('finances.income') : $_('finances.expense')}
                  </span>
                </td>
                <td class="px-4 py-2.5">{getCategoryName(record.category)}</td>
                <td class="px-4 py-2.5 text-gray-500">{record.project?.name || $_('finances.orgLevel') || 'Organization'}</td>
                <td class="px-4 py-2.5 text-gray-400 max-w-[200px] truncate">{record.description || ''}</td>
                <td class="px-4 py-2.5 text-right {record.type === 'INCOME' ? 'text-green-400' : 'text-red-400'}">{formatCurrency(record.amountInBaseCurrency)}</td>
                <td class="px-4 py-2.5 text-right">
                  <button on:click={() => openEditModal(record)} class="text-gray-500 hover:text-gray-300 mr-2">✏️</button>
                  {#if deletingId === record.id}
                    <button on:click={() => deleteRecord(record.id)} class="text-red-400 text-xs">✓</button>
                    <button on:click={() => deletingId = null} class="text-gray-400 text-xs ml-1">✗</button>
                  {:else}
                    <button on:click={() => deletingId = record.id} class="text-gray-500 hover:text-red-400">🗑️</button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if totalPages > 1}
          <div class="flex items-center justify-center gap-2 py-3 text-sm text-gray-400">
            <button disabled={currentPage <= 1} on:click={() => { currentPage--; fetchRecords(); }} class="px-2 py-1 disabled:opacity-30">←</button>
            <span>{currentPage} / {totalPages}</span>
            <button disabled={currentPage >= totalPages} on:click={() => { currentPage++; fetchRecords(); }} class="px-2 py-1 disabled:opacity-30">→</button>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<!-- Record Modal -->
{#if showRecordModal}
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showRecordModal = false}>
  <div class="bg-gray-800 rounded-xl w-full max-w-md p-6">
    <h3 class="text-lg font-semibold text-white mb-4">{editingRecord ? $_('finances.editRecord') : $_('finances.addRecord')}</h3>

    <div class="mb-4">
      <div class="flex bg-gray-700 rounded-lg overflow-hidden">
        <button class="flex-1 py-2 text-sm {recordForm.type === 'EXPENSE' ? 'bg-red-500/20 text-red-400 font-semibold' : 'text-gray-400'}" on:click={() => recordForm.type = 'EXPENSE'}>{$_('finances.expense')}</button>
        <button class="flex-1 py-2 text-sm {recordForm.type === 'INCOME' ? 'bg-green-500/20 text-green-400 font-semibold' : 'text-gray-400'}" on:click={() => recordForm.type = 'INCOME'}>{$_('finances.income')}</button>
      </div>
    </div>

    <div class="mb-4">
      <label class="block text-sm text-gray-400 mb-1">{$_('finances.category')}</label>
      <select bind:value={recordForm.categoryId} class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
        <option value="">—</option>
        {#each filteredCategories as cat}
          <option value={cat.id}>{getCategoryName(cat)}</option>
        {/each}
      </select>
    </div>

    <div class="grid grid-cols-3 gap-3 mb-4">
      <div class="col-span-2">
        <label class="block text-sm text-gray-400 mb-1">{$_('finances.amount')}</label>
        <input type="number" step="0.01" min="0.01" bind:value={recordForm.amount} class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" />
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-1">{$_('finances.currency')}</label>
        <select bind:value={recordForm.currency} class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
          {#each SUPPORTED_CURRENCIES as c}<option value={c}>{c}</option>{/each}
        </select>
      </div>
    </div>

    <div class="mb-4">
      <label class="block text-sm text-gray-400 mb-1">{$_('finances.date')}</label>
      <input type="date" bind:value={recordForm.date} class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" />
    </div>

    <div class="mb-4">
      <label class="block text-sm text-gray-400 mb-1">{$_('finances.description')}</label>
      <textarea bind:value={recordForm.description} rows="2" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"></textarea>
    </div>

    <div class="flex gap-3 justify-end">
      <button on:click={() => showRecordModal = false} class="px-4 py-2 text-gray-400 hover:text-white">{$_('finances.cancel')}</button>
      <button on:click={saveRecord} disabled={recordSaving || !recordForm.categoryId || !recordForm.amount} class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
        {recordSaving ? '...' : $_('finances.save')}
      </button>
    </div>
  </div>
</div>
{/if}

<!-- Categories Modal -->
{#if showCategoriesModal}
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showCategoriesModal = false}>
  <div class="bg-gray-800 rounded-xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-white">{$_('finances.categories.title')}</h3>
      <button on:click={() => showCategoriesModal = false} class="text-gray-400 hover:text-white">✕</button>
    </div>

    {#each ['EXPENSE', 'INCOME'] as catType}
      <h4 class="text-sm font-medium text-gray-400 mb-2 mt-4">{catType === 'EXPENSE' ? $_('finances.categories.expenseCategories') : $_('finances.categories.incomeCategories')}</h4>
      {#each categories.filter(c => c.type === catType || c.type === 'BOTH') as cat}
        <div class="flex items-center justify-between py-2 px-3 bg-gray-700/30 rounded mb-1">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded" style="background: {cat.color}"></div>
            <span class="text-sm">{getCategoryName(cat)}</span>
          </div>
          {#if cat.isDefault}
            <span class="text-xs text-gray-500">{$_('finances.categories.default')}</span>
          {:else}
            <button on:click={() => deleteCategoryById(cat.id)} class="text-gray-500 hover:text-red-400 text-xs">🗑️</button>
          {/if}
        </div>
      {/each}
    {/each}

    <div class="mt-4 flex gap-2">
      <input bind:value={newCatName} placeholder={$_('finances.categories.newCategory')} class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white" />
      <select bind:value={newCatType} class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white">
        <option value="EXPENSE">{$_('finances.expense')}</option>
        <option value="INCOME">{$_('finances.income')}</option>
      </select>
      <input type="color" bind:value={newCatColor} class="w-8 h-8 rounded cursor-pointer" />
      <button on:click={addCategory} disabled={catSaving || !newCatName.trim()} class="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50">{$_('finances.categories.addCategory')}</button>
    </div>
  </div>
</div>
{/if}
{/if}
