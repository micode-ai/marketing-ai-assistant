<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount, onDestroy, tick } from 'svelte';
  import { api } from '$lib/api/client';
  import SectionHint from '$lib/components/SectionHint.svelte';
  import { currentProjectStore, projectsStore, navigatingToOrg } from '$lib/stores/projects';

  $: projectId = $page.params['id'];

  // Sync picker with this project — skip if navigating to org view
  $: if ($projectsStore.length > 0 && projectId && !$navigatingToOrg) {
    const project = $projectsStore.find((p: any) => p.id === projectId);
    if (project && $currentProjectStore?.id !== projectId) {
      currentProjectStore.set(project);
    }
  }

  const SUPPORTED_CURRENCIES = ['USD','EUR','GBP','PLN','RUB','UAH','BYN','KZT','TRY','JPY','CNY'];

  // State
  let loading = true;
  let records: any[] = [];
  let totalRecords = 0;
  let currentPage = 1;
  const pageLimit = 20;
  let summary: any = null;
  let categories: any[] = [];
  let baseCurrency = 'USD';

  // Period filter
  let periodMode: 'month' | 'quarter' | 'year' | 'custom' = 'month';
  let customDateFrom = '';
  let customDateTo = '';

  // Table filters
  let filterType: 'ALL' | 'INCOME' | 'EXPENSE' = 'ALL';
  let filterCategoryId = '';

  // Chart
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
  let exchangeRate: { rate: number; date: string } | null = null;
  let exchangeRateLoading = false;

  // Categories modal
  let showCategoriesModal = false;
  let newCatName = '';
  let newCatType: 'EXPENSE' | 'INCOME' = 'EXPENSE';
  let newCatColor = '#6366F1';
  let catSaving = false;

  // Delete confirm
  let deletingId: string | null = null;

  // Computed dates
  function getDateRange(): { dateFrom: string; dateTo: string } {
    const now = new Date();
    const to = now.toISOString().substring(0, 10);
    let from: string;
    if (periodMode === 'month') {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      from = d.toISOString().substring(0, 10);
    } else if (periodMode === 'quarter') {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      from = d.toISOString().substring(0, 10);
    } else if (periodMode === 'year') {
      const d = new Date(now);
      d.setDate(d.getDate() - 365);
      from = d.toISOString().substring(0, 10);
    } else {
      from = customDateFrom || to;
      return { dateFrom: from, dateTo: customDateTo || to };
    }
    return { dateFrom: from, dateTo: to };
  }

  // Category name resolver
  function getCategoryName(cat: any): string {
    if (!cat) return '';
    const key = cat.name;
    const translated = $_(key);
    // If i18n returns the key itself, it's a custom name
    return translated === key ? key : translated;
  }

  function formatCurrency(amount: number, currency?: string): string {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency || baseCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency || baseCurrency}`;
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Data fetching
  async function fetchAll() {
    loading = true;
    try {
      await Promise.all([fetchSummary(), fetchRecords(), fetchCategories()]);
    } finally {
      loading = false;
    }
    if (ChartJS && summary) {
      await tick();
      requestAnimationFrame(() => renderCharts());
    }
  }

  async function fetchSummary() {
    const { dateFrom, dateTo } = getDateRange();
    try {
      summary = await api.get<any>('/finances/summary', { projectId, dateFrom, dateTo });
      if (summary?.baseCurrency) baseCurrency = summary.baseCurrency;
    } catch (e) {
      console.error('Failed to load summary:', e);
    }
  }

  async function fetchRecords() {
    const { dateFrom, dateTo } = getDateRange();
    const params: any = { projectId, dateFrom, dateTo, page: currentPage, limit: pageLimit };
    if (filterType !== 'ALL') params.type = filterType;
    if (filterCategoryId) params.categoryId = filterCategoryId;
    try {
      const res = await api.get<any>('/finances', params);
      records = res.data || [];
      totalRecords = res.total || 0;
      if (res.baseCurrency) baseCurrency = res.baseCurrency;
    } catch (e) {
      console.error('Failed to load records:', e);
      records = [];
    }
  }

  async function fetchCategories() {
    try {
      categories = await api.get<any[]>('/finances/categories', { projectId });
    } catch (e) {
      console.error('Failed to load categories:', e);
    }
  }

  async function fetchExchangeRate() {
    if (!recordForm.currency || recordForm.currency === baseCurrency) {
      exchangeRate = null;
      return;
    }
    exchangeRateLoading = true;
    try {
      exchangeRate = await api.get<any>('/finances/exchange-rate', { from: recordForm.currency, to: baseCurrency });
    } catch {
      exchangeRate = null;
    } finally {
      exchangeRateLoading = false;
    }
  }

  // Period change
  function setPeriod(mode: typeof periodMode) {
    periodMode = mode;
    currentPage = 1;
    fetchAll();
  }

  function applyCustomDates() {
    if (customDateFrom && customDateTo) {
      currentPage = 1;
      fetchAll();
    }
  }

  // Filter change
  function setFilterType(type: typeof filterType) {
    filterType = type;
    currentPage = 1;
    fetchRecords();
  }

  function setFilterCategory(catId: string) {
    filterCategoryId = catId;
    currentPage = 1;
    fetchRecords();
  }

  // Pagination
  $: totalPages = Math.ceil(totalRecords / pageLimit) || 1;
  function goToPage(p: number) {
    if (p < 1 || p > totalPages) return;
    currentPage = p;
    fetchRecords();
  }

  // Record CRUD
  function openCreateRecord() {
    editingRecord = null;
    recordForm = {
      type: 'EXPENSE',
      categoryId: '',
      amount: '',
      currency: baseCurrency,
      description: '',
      date: new Date().toISOString().substring(0, 10),
    };
    exchangeRate = null;
    showRecordModal = true;
  }

  function openEditRecord(record: any) {
    editingRecord = record;
    recordForm = {
      type: record.type,
      categoryId: record.categoryId || '',
      amount: record.amount,
      currency: record.currency,
      description: record.description || '',
      date: record.date ? record.date.substring(0, 10) : '',
    };
    showRecordModal = true;
    if (record.currency !== baseCurrency) {
      fetchExchangeRate();
    } else {
      exchangeRate = null;
    }
  }

  async function saveRecord() {
    if (!recordForm.amount || !recordForm.categoryId) return;
    recordSaving = true;
    try {
      if (editingRecord) {
        await api.put(`/finances/${editingRecord.id}`, {
          categoryId: recordForm.categoryId,
          type: recordForm.type,
          amount: Number(recordForm.amount),
          currency: recordForm.currency,
          description: recordForm.description || null,
          date: new Date(recordForm.date).toISOString(),
        });
      } else {
        await api.post('/finances', {
          projectId,
          categoryId: recordForm.categoryId,
          type: recordForm.type,
          amount: Number(recordForm.amount),
          currency: recordForm.currency,
          description: recordForm.description || null,
          date: new Date(recordForm.date).toISOString(),
        });
      }
      showRecordModal = false;
      await fetchAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      recordSaving = false;
    }
  }

  async function deleteRecord(id: string) {
    try {
      await api.delete(`/finances/${id}`);
      deletingId = null;
      await fetchAll();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Categories CRUD
  async function addCategory() {
    if (!newCatName.trim()) return;
    catSaving = true;
    try {
      await api.post('/finances/categories', {
        projectId,
        name: newCatName.trim(),
        type: newCatType,
        color: newCatColor,
      });
      newCatName = '';
      await fetchCategories();
    } catch (e: any) {
      alert(e.message);
    } finally {
      catSaving = false;
    }
  }

  async function deleteCategory(catId: string) {
    try {
      await api.delete(`/finances/categories/${catId}`);
      await fetchCategories();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Filtered categories for record modal
  $: filteredCategories = categories.filter(c => {
    if (recordForm.type === 'EXPENSE') return c.type === 'EXPENSE' || c.type === 'BOTH';
    return c.type === 'INCOME' || c.type === 'BOTH';
  });

  // Charts
  function destroyCharts() {
    barChart?.destroy();
    doughnutChart?.destroy();
    barChart = null;
    doughnutChart = null;
  }

  function renderCharts() {
    destroyCharts();
    if (!summary) return;
    renderBarChart();
    renderDoughnutChart();
  }

  function renderBarChart() {
    if (!barCanvas?.getContext('2d') || !summary?.monthly) return;
    const monthly = summary.monthly || [];
    const labels = monthly.map((m: any) => m.month);
    barChart = new ChartJS(barCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: $_('finances.income'),
            data: monthly.map((m: any) => m.income),
            backgroundColor: '#10B981',
          },
          {
            label: $_('finances.expenses'),
            data: monthly.map((m: any) => m.expense),
            backgroundColor: '#EF4444',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: { beginAtZero: true },
        },
      },
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
        labels: byCategory.map((c: any) => {
          const name = c.categoryName || c.name || '';
          const translated = $_(name);
          return translated === name ? name : translated;
        }),
        datasets: [{
          data: byCategory.map((c: any) => c.total),
          backgroundColor: byCategory.map((c: any) => c.categoryColor || c.color || '#6366F1'),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8 } },
        },
      },
    });
  }

  function toggleDoughnutMode() {
    doughnutMode = doughnutMode === 'EXPENSE' ? 'INCOME' : 'EXPENSE';
    renderDoughnutChart();
  }

  // Record form: watch currency changes
  $: if (showRecordModal && recordForm.currency) {
    fetchExchangeRate();
  }

  // Record form: reset categoryId when type changes
  function onRecordTypeChange() {
    recordForm.categoryId = '';
  }

  onMount(async () => {
    const { Chart } = await import('chart.js/auto');
    ChartJS = Chart;
    await fetchAll();
  });

  // Re-fetch when projectId changes (e.g. project picker)
  let prevProjectId: string | undefined = '';
  $: if (projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    if (ChartJS) fetchAll();
  }

  onDestroy(() => {
    destroyCharts();
  });
</script>

<div class="p-4 sm:p-6">
  <SectionHint sectionKey="finances" titleKey="hints.finances.title" descKey="hints.finances.desc" />

  <!-- Header -->
  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{$_('finances.title')}</h1>
      <p class="text-sm text-gray-500 mt-0.5">{$_('finances.subtitle')}</p>
    </div>
    <div class="flex items-center gap-3 flex-wrap">
      <!-- Period selector -->
      <div class="flex bg-gray-100 rounded-lg p-0.5">
        {#each [['month', $_('finances.month')], ['quarter', $_('finances.quarter')], ['year', $_('finances.year')], ['custom', $_('finances.custom')]] as [mode, label]}
          <button
            on:click={() => setPeriod(mode as any)}
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 cursor-pointer
              {periodMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
          >
            {label}
          </button>
        {/each}
      </div>
      {#if periodMode === 'custom'}
        <div class="flex items-center gap-2">
          <input type="date" bind:value={customDateFrom} class="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <span class="text-gray-400 text-xs">-</span>
          <input type="date" bind:value={customDateTo} class="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <button on:click={applyCustomDates} class="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 cursor-pointer">OK</button>
        </div>
      {/if}
      <button
        on:click={openCreateRecord}
        class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('finances.addRecord')}
      </button>
    </div>
  </div>

  {#if loading}
    <div class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {#each Array(3) as _}
          <div class="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-24"></div>
        {/each}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div class="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-64"></div>
        <div class="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-64"></div>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 animate-pulse h-48"></div>
    </div>
  {:else}
    <!-- Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <!-- Income -->
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-gray-500">{$_('finances.income')}</p>
            <p class="text-xl font-bold text-green-600">{formatCurrency(summary?.totalIncome || 0)}</p>
          </div>
        </div>
      </div>
      <!-- Expenses -->
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6L9 12.75l4.306-4.307a11.95 11.95 0 015.814 5.519l2.74 1.22m0 0l-5.94 2.28m5.94-2.28l-2.28-5.941" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-gray-500">{$_('finances.expenses')}</p>
            <p class="text-xl font-bold text-red-600">{formatCurrency(summary?.totalExpense || 0)}</p>
          </div>
        </div>
      </div>
      <!-- Profit -->
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-gray-500">{$_('finances.profit')}</p>
            <p class="text-xl font-bold {(summary?.profit || 0) >= 0 ? 'text-indigo-600' : 'text-red-600'}">{formatCurrency(summary?.profit || 0)}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts -->
    {#if summary?.monthly?.length > 0 || summary?.byCategory?.length > 0}
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        <!-- Bar chart -->
        <div class="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5">
          <h3 class="text-sm font-semibold text-gray-900 mb-3">{$_('finances.incomeVsExpenses')}</h3>
          <div class="h-64">
            <canvas bind:this={barCanvas}></canvas>
          </div>
        </div>
        <!-- Doughnut chart -->
        <div class="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-gray-900">{$_('finances.byCategory')}</h3>
            <button
              on:click={toggleDoughnutMode}
              class="text-xs px-2.5 py-1 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer
                {doughnutMode === 'EXPENSE' ? 'text-red-600' : 'text-green-600'}"
            >
              {doughnutMode === 'EXPENSE' ? $_('finances.expenses') : $_('finances.income')}
            </button>
          </div>
          <div class="h-56">
            <canvas bind:this={doughnutCanvas}></canvas>
          </div>
        </div>
      </div>
    {/if}

    <!-- Table filters -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
      <div class="flex bg-gray-100 rounded-lg p-0.5">
        {#each [['ALL', $_('finances.all')], ['INCOME', $_('finances.income')], ['EXPENSE', $_('finances.expenses')]] as [type, label]}
          <button
            on:click={() => setFilterType(type as any)}
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 cursor-pointer
              {filterType === type ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
          >
            {label}
          </button>
        {/each}
      </div>
      <select
        value={filterCategoryId}
        on:change={e => setFilterCategory((e.target as HTMLSelectElement).value)}
        class="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
      >
        <option value="">{$_('finances.filterByCategory')}</option>
        {#each categories as cat}
          <option value={cat.id}>{getCategoryName(cat)}</option>
        {/each}
      </select>
      <button
        on:click={() => showCategoriesModal = true}
        class="text-xs text-primary-600 hover:text-primary-700 font-medium cursor-pointer"
      >
        {$_('finances.manageCategories')}
      </button>
    </div>

    <!-- Records table -->
    {#if records.length === 0}
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <div class="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('finances.title')}</h2>
        <p class="text-gray-500 mb-6">{$_('finances.emptyState')}</p>
        <button
          on:click={openCreateRecord}
          class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {$_('finances.addRecord')}
        </button>
      </div>
    {:else}
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-100 bg-gray-50">
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{$_('finances.date')}</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{$_('finances.type')}</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{$_('finances.category')}</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{$_('finances.description')}</th>
                <th class="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">{$_('finances.amount')}</th>
                <th class="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">{$_('finances.amountInBase', { values: { currency: baseCurrency } })}</th>
                <th class="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody>
              {#each records as record}
                <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(record.date)}</td>
                  <td class="px-4 py-3">
                    <span class="text-xs px-2 py-0.5 rounded font-medium {record.type === 'INCOME' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                      {record.type === 'INCOME' ? $_('finances.income') : $_('finances.expense')}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-gray-700">
                    {#if record.category}
                      <span class="flex items-center gap-1.5">
                        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: {record.category.color || '#6366F1'}"></span>
                        {getCategoryName(record.category)}
                      </span>
                    {/if}
                  </td>
                  <td class="px-4 py-3 text-gray-500 max-w-[200px] truncate">{record.description || ''}</td>
                  <td class="px-4 py-3 text-right font-medium whitespace-nowrap {record.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}">
                    {record.type === 'INCOME' ? '+' : '-'}{formatCurrency(record.amount, record.currency)}
                  </td>
                  <td class="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                    {#if record.currency !== baseCurrency && record.amountInBaseCurrency != null}
                      {formatCurrency(record.amountInBaseCurrency)}
                    {:else if record.currency === baseCurrency}
                      <span class="text-gray-300">-</span>
                    {/if}
                  </td>
                  <td class="px-4 py-3 text-right">
                    <div class="flex items-center justify-end gap-1">
                      <button
                        on:click={() => openEditRecord(record)}
                        class="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
                        title={$_('common.edit')}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                        </svg>
                      </button>
                      <button
                        on:click={() => deletingId = record.id}
                        class="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                        title={$_('common.delete')}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <!-- Pagination -->
        {#if totalPages > 1}
          <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p class="text-xs text-gray-500">{totalRecords} {$_('finances.all').toLowerCase()}</p>
            <div class="flex items-center gap-1">
              <button
                on:click={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
              >&laquo;</button>
              {#each Array(totalPages) as _, i}
                {#if totalPages <= 7 || i === 0 || i === totalPages - 1 || Math.abs(i + 1 - currentPage) <= 1}
                  <button
                    on:click={() => goToPage(i + 1)}
                    class="px-2.5 py-1 text-xs rounded cursor-pointer
                      {currentPage === i + 1 ? 'bg-primary-600 text-white' : 'border border-gray-300 hover:bg-gray-50'}"
                  >{i + 1}</button>
                {:else if Math.abs(i + 1 - currentPage) === 2}
                  <span class="px-1 text-gray-400 text-xs">...</span>
                {/if}
              {/each}
              <button
                on:click={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
              >&raquo;</button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<!-- Add/Edit Record Modal -->
{#if showRecordModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showRecordModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
      <div class="p-6 border-b border-gray-100 flex items-center gap-2.5">
        <div class="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900">{editingRecord ? $_('finances.editRecord') : $_('finances.addRecord')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <!-- Type toggle -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">{$_('finances.type')} *</label>
          <div class="flex bg-gray-100 rounded-lg p-0.5">
            <button
              on:click={() => { recordForm.type = 'EXPENSE'; onRecordTypeChange(); }}
              class="flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors duration-150 cursor-pointer
                {recordForm.type === 'EXPENSE' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
            >{$_('finances.expense')}</button>
            <button
              on:click={() => { recordForm.type = 'INCOME'; onRecordTypeChange(); }}
              class="flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors duration-150 cursor-pointer
                {recordForm.type === 'INCOME' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
            >{$_('finances.income')}</button>
          </div>
        </div>
        <!-- Category -->
        <div>
          <label for="r-cat" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('finances.category')} *</label>
          <select id="r-cat" bind:value={recordForm.categoryId} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
            <option value="">-- {$_('finances.category')} --</option>
            {#each filteredCategories as cat}
              <option value={cat.id}>{getCategoryName(cat)}</option>
            {/each}
          </select>
        </div>
        <!-- Amount + Currency -->
        <div class="grid grid-cols-5 gap-3">
          <div class="col-span-3">
            <label for="r-amount" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('finances.amount')} *</label>
            <input id="r-amount" type="number" step="0.01" min="0" bind:value={recordForm.amount} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <div class="col-span-2">
            <label for="r-currency" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('finances.currency')}</label>
            <select id="r-currency" bind:value={recordForm.currency} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              {#each SUPPORTED_CURRENCIES as cur}
                <option value={cur}>{cur}</option>
              {/each}
            </select>
          </div>
        </div>
        <!-- Exchange rate preview -->
        {#if recordForm.currency !== baseCurrency}
          <div class="bg-gray-50 rounded-lg px-3 py-2.5 text-xs text-gray-600">
            {#if exchangeRateLoading}
              <span class="text-gray-400">{$_('finances.exchangeRate')}...</span>
            {:else if exchangeRate}
              <div>{$_('finances.exchangeRateInfo', { values: { from: recordForm.currency, to: baseCurrency } })}: <span class="font-medium">{exchangeRate.rate.toFixed(4)}</span></div>
              {#if recordForm.amount}
                <div class="mt-1">{$_('finances.amountInBase', { values: { currency: baseCurrency } })}: <span class="font-semibold">{formatCurrency(Number(recordForm.amount) * exchangeRate.rate)}</span></div>
              {/if}
              {#if exchangeRate.date}
                <div class="mt-1 text-gray-400">{$_('finances.exchangeRateSource', { values: { date: exchangeRate.date } })}</div>
              {/if}
            {/if}
          </div>
        {/if}
        <!-- Date -->
        <div>
          <label for="r-date" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('finances.date')} *</label>
          <input id="r-date" type="date" bind:value={recordForm.date} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        <!-- Description -->
        <div>
          <label for="r-desc" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('finances.description')}</label>
          <textarea id="r-desc" bind:value={recordForm.description} rows="2" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"></textarea>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={saveRecord}
          disabled={recordSaving || !recordForm.amount || !recordForm.categoryId}
          class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if recordSaving}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          {/if}
          {$_('finances.save')}
        </button>
        <button on:click={() => showRecordModal = false} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
          {$_('finances.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Manage Categories Modal -->
{#if showCategoriesModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showCategoriesModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
      <div class="p-6 border-b border-gray-100 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900">{$_('finances.categories.title')}</h2>
        <button on:click={() => showCategoriesModal = false} class="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="p-6 space-y-6">
        <!-- Expense categories -->
        <div>
          <h3 class="text-sm font-semibold text-gray-900 mb-2">{$_('finances.categories.expenseCategories')}</h3>
          <div class="space-y-1.5">
            {#each categories.filter(c => c.type === 'EXPENSE' || c.type === 'BOTH') as cat}
              <div class="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50">
                <span class="flex items-center gap-2 text-sm">
                  <span class="w-3 h-3 rounded-full" style="background-color: {cat.color || '#6366F1'}"></span>
                  {getCategoryName(cat)}
                  {#if cat.isDefault}
                    <span class="text-xs text-gray-400">({$_('finances.categories.default')})</span>
                  {/if}
                </span>
                {#if !cat.isDefault}
                  <button
                    on:click={() => deleteCategory(cat.id)}
                    class="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                    title={$_('common.delete')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </div>
        <!-- Income categories -->
        <div>
          <h3 class="text-sm font-semibold text-gray-900 mb-2">{$_('finances.categories.incomeCategories')}</h3>
          <div class="space-y-1.5">
            {#each categories.filter(c => c.type === 'INCOME' || c.type === 'BOTH') as cat}
              <div class="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50">
                <span class="flex items-center gap-2 text-sm">
                  <span class="w-3 h-3 rounded-full" style="background-color: {cat.color || '#6366F1'}"></span>
                  {getCategoryName(cat)}
                  {#if cat.isDefault}
                    <span class="text-xs text-gray-400">({$_('finances.categories.default')})</span>
                  {/if}
                </span>
                {#if !cat.isDefault}
                  <button
                    on:click={() => deleteCategory(cat.id)}
                    class="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                    title={$_('common.delete')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </div>
        <!-- Add new category -->
        <div class="border-t border-gray-100 pt-4">
          <h3 class="text-sm font-semibold text-gray-900 mb-2">{$_('finances.categories.addCategory')}</h3>
          <div class="flex items-end gap-2">
            <div class="flex-1">
              <input
                type="text"
                bind:value={newCatName}
                placeholder={$_('finances.categories.newCategory')}
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <select bind:value={newCatType} class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="EXPENSE">{$_('finances.expense')}</option>
              <option value="INCOME">{$_('finances.income')}</option>
            </select>
            <input type="color" bind:value={newCatColor} class="w-10 h-9 rounded border border-gray-300 cursor-pointer" />
            <button
              on:click={addCategory}
              disabled={catSaving || !newCatName.trim()}
              class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 cursor-pointer"
            >
              {#if catSaving}
                <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              {:else}
                +
              {/if}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Record Confirm Modal -->
{#if deletingId}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => deletingId = null}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
      <div class="p-6">
        <div class="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900 mb-2">{$_('finances.deleteRecord')}</h2>
        <p class="text-sm text-gray-500 mb-6">{$_('finances.deleteRecordConfirm')}</p>
        <div class="flex gap-3">
          <button
            on:click={() => deleteRecord(deletingId!)}
            class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors duration-150 text-sm cursor-pointer"
          >
            {$_('common.delete')}
          </button>
          <button on:click={() => deletingId = null} class="flex-1 px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
            {$_('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
