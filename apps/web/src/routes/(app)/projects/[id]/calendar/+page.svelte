<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import SectionHint from '$lib/components/SectionHint.svelte';

  let contents: any[] = [];
  let campaigns: any[] = [];
  let loading = true;
  $: projectId = $page.params['id'];

  // Calendar navigation
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();
  const today = new Date();

  // Filters
  let filterStatus = '';
  let filterType = '';

  // Interaction state
  let selectedContent: any = null;
  let schedulingDate: string | null = null;
  let scheduling = false;

  // Responsive / view
  let viewMode: 'month' | 'week' = 'month';
  let isMobile = false;
  let currentWeekStart: Date = getWeekStart(new Date());

  // Constants
  const STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED'];
  const CONTENT_TYPES = ['SOCIAL_POST', 'BLOG_ARTICLE', 'EMAIL', 'NEWSLETTER', 'AD_COPY', 'LANDING_PAGE'];

  const statusBadge: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    REVIEW: 'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-green-100 text-green-700',
    PUBLISHED: 'bg-blue-100 text-blue-700',
    REJECTED: 'bg-red-100 text-red-600',
  };

  const statusDot: Record<string, string> = {
    DRAFT: 'bg-gray-400',
    REVIEW: 'bg-yellow-400',
    APPROVED: 'bg-green-500',
    PUBLISHED: 'bg-blue-500',
    REJECTED: 'bg-red-400',
  };

  const statusLabel: Record<string, string> = {
    DRAFT: 'content.draft',
    REVIEW: 'content.review',
    APPROVED: 'content.approved',
    PUBLISHED: 'content.published',
    REJECTED: 'content.rejected',
  };

  const typeLabel: Record<string, string> = {
    SOCIAL_POST: 'content.socialPost',
    BLOG_ARTICLE: 'content.blogArticle',
    EMAIL: 'content.emailContent',
    NEWSLETTER: 'content.newsletter',
    AD_COPY: 'content.adCopy',
    LANDING_PAGE: 'content.landingPage',
  };

  const campaignColors = [
    'bg-indigo-50',
    'bg-emerald-50',
    'bg-amber-50',
    'bg-rose-50',
  ];

  const campaignLegendColors = [
    'bg-indigo-200',
    'bg-emerald-200',
    'bg-amber-200',
    'bg-rose-200',
  ];

  // ─── Date helpers ──────────────────────────────────────────

  function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfWeek(year: number, month: number): number {
    const jsDay = new Date(year, month, 1).getDay();
    return jsDay === 0 ? 6 : jsDay - 1; // Monday = 0 ... Sunday = 6
  }

  function toDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  function isToday(year: number, month: number, day: number): boolean {
    return today.getFullYear() === year
      && today.getMonth() === month
      && today.getDate() === day;
  }

  function formatMonthYear(year: number, month: number): string {
    return new Date(year, month).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }

  // ─── Data fetching ─────────────────────────────────────────

  async function fetchCalendarData() {
    loading = true;
    try {
      const [contentData, campaignData] = await Promise.all([
        api.get<any[]>('/content', { projectId }),
        api.get<any[]>('/campaigns', { projectId }),
      ]);
      contents = contentData;
      campaigns = campaignData;
    } catch (e: any) {
      alert(e.message);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    isMobile = window.innerWidth < 768;
    if (isMobile) viewMode = 'week';

    const handleResize = () => {
      isMobile = window.innerWidth < 768;
      if (isMobile && viewMode === 'month') viewMode = 'week';
    };
    window.addEventListener('resize', handleResize);
    fetchCalendarData();
    return () => window.removeEventListener('resize', handleResize);
  });

  // ─── Reactive derived data ─────────────────────────────────

  $: filteredContents = contents.filter(c => {
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterType && c.type !== filterType) return false;
    return true;
  });

  $: contentByDate = (() => {
    const map: Record<string, any[]> = {};
    for (const c of filteredContents) {
      const dateStr = c.scheduledAt || c.createdAt;
      if (!dateStr) continue;
      const key = toDateKey(new Date(dateStr));
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  })();

  $: calendarDays = (() => {
    const firstDayOffset = getFirstDayOfWeek(currentYear, currentMonth);
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const pm = currentMonth === 0 ? 11 : currentMonth - 1;
    const py = currentMonth === 0 ? currentYear - 1 : currentYear;
    const daysInPrevMonth = getDaysInMonth(py, pm);

    const days: Array<{ day: number; month: number; year: number; isCurrentMonth: boolean }> = [];

    for (let i = firstDayOffset - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, month: pm, year: py, isCurrentMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, month: currentMonth, year: currentYear, isCurrentMonth: true });
    }
    const nm = currentMonth === 11 ? 0 : currentMonth + 1;
    const ny = currentMonth === 11 ? currentYear + 1 : currentYear;
    const totalCells = Math.ceil(days.length / 7) * 7;
    let nextDay = 1;
    while (days.length < totalCells) {
      days.push({ day: nextDay++, month: nm, year: ny, isCurrentMonth: false });
    }
    return days;
  })();

  $: activeCampaigns = campaigns.filter(c => c.startDate && c.endDate);

  $: unscheduledContents = contents.filter(c => !c.scheduledAt);

  // Pre-resolve i18n strings used inside {#each} blocks to avoid scoped store subscription warnings
  $: todayLabel = $_('calendar.today');
  $: scheduleContentLabel = $_('calendar.scheduleContent');
  $: resolvedStatusLabels = Object.fromEntries(
    STATUSES.map(s => [s, $_(statusLabel[s])])
  ) as Record<string, string>;

  // ─── Navigation ────────────────────────────────────────────

  function prevMonth() {
    if (currentMonth === 0) { currentMonth = 11; currentYear--; }
    else { currentMonth--; }
  }

  function nextMonth() {
    if (currentMonth === 11) { currentMonth = 0; currentYear++; }
    else { currentMonth++; }
  }

  function goToToday() {
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    if (viewMode === 'week') currentWeekStart = getWeekStart(today);
  }

  function prevWeek() {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    currentWeekStart = d;
    currentYear = d.getFullYear();
    currentMonth = d.getMonth();
  }

  function nextWeek() {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    currentWeekStart = d;
    currentYear = d.getFullYear();
    currentMonth = d.getMonth();
  }

  // ─── Interactions ──────────────────────────────────────────

  function onContentClick(content: any) {
    selectedContent = content;
  }

  function onDayClick(dayInfo: { day: number; month: number; year: number }) {
    const dateKey = toDateKey(new Date(dayInfo.year, dayInfo.month, dayInfo.day));
    const dayContents = contentByDate[dateKey];
    if (!dayContents || dayContents.length === 0) {
      schedulingDate = dateKey;
    }
  }

  async function scheduleContentOnDate(contentId: string) {
    if (!schedulingDate) return;
    scheduling = true;
    try {
      const isoDate = new Date(schedulingDate + 'T12:00:00').toISOString();
      const updated = await api.put<any>(`/content/${contentId}`, { scheduledAt: isoDate });
      contents = contents.map(c => c.id === updated.id ? { ...c, ...updated } : c);
      schedulingDate = null;
    } catch (e: any) {
      alert(e.message);
    } finally {
      scheduling = false;
    }
  }

  // ─── Campaign helpers ──────────────────────────────────────

  function getCampaignBg(dateKey: string): string {
    if (activeCampaigns.length === 0) return '';
    const date = new Date(dateKey + 'T12:00:00');
    for (let i = 0; i < activeCampaigns.length; i++) {
      const start = new Date(activeCampaigns[i].startDate);
      const end = new Date(activeCampaigns[i].endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      if (date >= start && date <= end) {
        return campaignColors[i % campaignColors.length];
      }
    }
    return '';
  }
</script>

<div class="p-4 sm:p-6">
  <SectionHint sectionKey="calendar" titleKey="hints.calendar.title" descKey="hints.calendar.desc" />
  <!-- Header -->
  <div class="flex items-center justify-between mb-5">
    <h1 class="text-2xl font-bold text-gray-900">{$_('calendar.title')}</h1>
    <div class="flex items-center gap-2">
      <!-- View toggle (desktop only) -->
      <div class="hidden md:flex items-center border border-gray-300 rounded-lg overflow-hidden">
        <button on:click={() => viewMode = 'month'}
          class="text-xs px-3 py-1.5 transition-colors duration-150 cursor-pointer
            {viewMode === 'month' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}">
          {$_('calendar.monthView')}
        </button>
        <button on:click={() => { viewMode = 'week'; currentWeekStart = getWeekStart(new Date(currentYear, currentMonth, 1)); }}
          class="text-xs px-3 py-1.5 transition-colors duration-150 cursor-pointer
            {viewMode === 'week' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}">
          {$_('calendar.weekView')}
        </button>
      </div>
      <!-- Today button -->
      <button on:click={goToToday}
        class="text-xs px-3 py-1.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50
               transition-colors duration-150 cursor-pointer font-medium text-gray-700">
        {$_('calendar.today')}
      </button>
    </div>
  </div>

  <!-- Navigation + Filters row -->
  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
    <!-- Month/week navigation -->
    <div class="flex items-center gap-2">
      <button on:click={() => viewMode === 'week' ? prevWeek() : prevMonth()}
        class="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors duration-150 cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
      </button>
      <h2 class="text-lg font-semibold text-gray-900 min-w-[180px] text-center capitalize">
        {formatMonthYear(currentYear, currentMonth)}
      </h2>
      <button on:click={() => viewMode === 'week' ? nextWeek() : nextMonth()}
        class="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors duration-150 cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-2">
      <select bind:value={filterStatus}
        class="text-xs px-2 py-1.5 border border-gray-300 rounded-lg bg-white cursor-pointer
               focus:outline-none focus:ring-2 focus:ring-primary-500">
        <option value="">{$_('calendar.allStatuses')}</option>
        {#each STATUSES as s}
          <option value={s}>{$_(statusLabel[s])}</option>
        {/each}
      </select>
      <select bind:value={filterType}
        class="text-xs px-2 py-1.5 border border-gray-300 rounded-lg bg-white cursor-pointer
               focus:outline-none focus:ring-2 focus:ring-primary-500">
        <option value="">{$_('calendar.allTypes')}</option>
        {#each CONTENT_TYPES as t}
          <option value={t}>{$_(typeLabel[t])}</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- Campaign legend -->
  {#if activeCampaigns.length > 0}
    <div class="flex flex-wrap items-center gap-3 mb-3 text-xs text-gray-500">
      {#each activeCampaigns as campaign, idx}
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded {campaignLegendColors[idx % campaignLegendColors.length]}"></span>
          {campaign.name}
        </span>
      {/each}
    </div>
  {/if}

  {#if loading}
    <!-- Loading skeleton -->
    <div class="bg-white rounded-xl border border-gray-200 p-4">
      <div class="grid grid-cols-7 gap-px">
        {#each Array(42) as _}
          <div class="h-24 bg-gray-50 rounded animate-pulse"></div>
        {/each}
      </div>
    </div>
  {:else if viewMode === 'month'}
    <!-- Month view -->
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <!-- Day-of-week header -->
      <div class="grid grid-cols-7 border-b border-gray-200 bg-gray-50/50">
        {#each ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as dayKey}
          <div class="py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
            {$_(`calendar.${dayKey}`)}
          </div>
        {/each}
      </div>

      <!-- Day cells grid -->
      <div class="grid grid-cols-7">
        {#each calendarDays as dayInfo, idx}
          {@const dateKey = toDateKey(new Date(dayInfo.year, dayInfo.month, dayInfo.day))}
          {@const dayContents = contentByDate[dateKey] || []}
          {@const todayHighlight = isToday(dayInfo.year, dayInfo.month, dayInfo.day)}
          {@const campBg = getCampaignBg(dateKey)}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="min-h-[100px] p-1.5 border-b border-r border-gray-100 cursor-pointer
                   hover:bg-gray-50/50 transition-colors duration-100
                   {dayInfo.isCurrentMonth ? '' : 'opacity-40'}
                   {campBg}"
            on:click={() => onDayClick(dayInfo)}
          >
            <!-- Day number -->
            <div class="flex items-start justify-between mb-1">
              {#if todayHighlight}
                <span class="bg-primary-600 text-white text-xs font-semibold w-6 h-6 rounded-full flex items-center justify-center">
                  {dayInfo.day}
                </span>
              {:else}
                <span class="text-xs font-medium text-gray-700 w-6 h-6 flex items-center justify-center">
                  {dayInfo.day}
                </span>
              {/if}
            </div>

            <!-- Content items (max 3) -->
            <div class="space-y-0.5">
              {#each dayContents.slice(0, 3) as content}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div
                  class="flex items-center gap-1 px-1.5 py-0.5 rounded
                         text-[10px] leading-tight truncate cursor-pointer
                         hover:opacity-80 transition-opacity duration-100
                         {statusBadge[content.status] || 'bg-gray-100 text-gray-600'}"
                  on:click|stopPropagation={() => onContentClick(content)}
                  title={content.title}
                >
                  <span class="w-1.5 h-1.5 rounded-full flex-shrink-0
                    {statusDot[content.status] || 'bg-gray-400'}"></span>
                  <span class="truncate">{content.title}</span>
                </div>
              {/each}
              {#if dayContents.length > 3}
                <div class="text-[10px] text-gray-400 px-1.5">
                  {$_('calendar.moreItems', { values: { count: dayContents.length - 3 } })}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <!-- Week view -->
    <div class="space-y-2">
      {#each Array(7) as _, i}
        {@const weekDay = new Date(currentWeekStart.getFullYear(),
          currentWeekStart.getMonth(), currentWeekStart.getDate() + i)}
        {@const dateKey = toDateKey(weekDay)}
        {@const dayContents = contentByDate[dateKey] || []}
        {@const todayHighlight = isSameDay(weekDay, today)}

        <div class="bg-white rounded-xl border border-gray-200
          {todayHighlight ? 'border-primary-300 ring-1 ring-primary-100' : ''} p-3">

          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold
                {todayHighlight ? 'text-primary-600' : 'text-gray-900'}">
                {weekDay.toLocaleDateString(undefined, {
                  weekday: 'short', day: 'numeric', month: 'short'
                })}
              </span>
              {#if todayHighlight}
                <span class="text-[10px] px-1.5 py-0.5 bg-primary-100 text-primary-700
                  rounded-full font-medium">
                  {todayLabel}
                </span>
              {/if}
            </div>
            <span class="text-xs text-gray-400">{dayContents.length}</span>
          </div>

          {#if dayContents.length === 0}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="text-xs text-gray-400 py-2 text-center cursor-pointer hover:text-primary-500 transition-colors duration-150"
              on:click={() => onDayClick({
                day: weekDay.getDate(),
                month: weekDay.getMonth(),
                year: weekDay.getFullYear()
              })}>
              + {scheduleContentLabel}
            </div>
          {:else}
            <div class="space-y-1.5">
              {#each dayContents as content}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="flex items-center gap-2 p-2 rounded-lg border border-gray-100
                  cursor-pointer hover:bg-gray-50 transition-colors duration-150"
                  on:click={() => onContentClick(content)}>
                  <span class="w-2 h-2 rounded-full flex-shrink-0
                    {statusDot[content.status]}"></span>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 truncate">{content.title}</div>
                    <div class="text-xs text-gray-500">{content.type.replace('_', ' ')}</div>
                  </div>
                  <span class="text-[10px] px-1.5 py-0.5 rounded
                    {statusBadge[content.status]}">
                    {resolvedStatusLabels[content.status] || content.status}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Empty state (when no content at all and not loading) -->
  {#if !loading && contents.length === 0}
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <div class="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('calendar.noContent')}</h2>
      <p class="text-gray-500 mb-6">{$_('calendar.noContentDesc')}</p>
      <a href="/projects/{projectId}/content"
        class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700
               transition-colors duration-150 inline-flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
        </svg>
        {$_('content.title')}
      </a>
    </div>
  {/if}
</div>

<!-- Content detail slide-over -->
{#if selectedContent}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex justify-end z-50" on:click|self={() => selectedContent = null}>
    <div class="bg-white h-full w-full max-w-md shadow-2xl overflow-y-auto">
      <!-- Header -->
      <div class="p-6 border-b border-gray-100 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900">{$_('calendar.contentDetails')}</h2>
        <button on:click={() => selectedContent = null}
          class="p-1.5 rounded-lg hover:bg-gray-100 transition-colors duration-150 cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <!-- Body -->
      <div class="p-6 space-y-5">
        <!-- Badges -->
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">
            {selectedContent.type.replace('_', ' ')}
          </span>
          {#if selectedContent.platform}
            <span class="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
              {selectedContent.platform}
            </span>
          {/if}
          <span class="text-xs px-2 py-0.5 rounded {statusBadge[selectedContent.status] || 'bg-gray-100 text-gray-600'}">
            {$_(statusLabel[selectedContent.status] || 'content.draft')}
          </span>
          {#if selectedContent.aiGenerated}
            <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
              AI
            </span>
          {/if}
        </div>

        <!-- Title -->
        <h3 class="text-xl font-semibold text-gray-900">{selectedContent.title}</h3>

        <!-- Body preview -->
        <div class="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap line-clamp-[10]">
          {selectedContent.body}
        </div>

        <!-- Schedule & campaign info -->
        <div class="border-t border-gray-100 pt-4 space-y-3">
          <div class="flex items-center gap-2 text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            {#if selectedContent.scheduledAt}
              <span class="text-gray-600">
                {$_('calendar.scheduledFor', {
                  values: {
                    date: new Date(selectedContent.scheduledAt)
                      .toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
                  }
                })}
              </span>
            {:else}
              <span class="text-gray-400 italic">{$_('calendar.unscheduled')}</span>
            {/if}
          </div>
          {#if selectedContent.campaign}
            <div class="flex items-center gap-2 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
              </svg>
              <span class="text-gray-500">{$_('calendar.campaign')}:</span>
              <span class="font-medium text-gray-700">{selectedContent.campaign.name}</span>
            </div>
          {/if}
          {#if selectedContent.createdAt}
            <div class="flex items-center gap-2 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <span class="text-gray-500">
                {$_('calendar.createdOn', {
                  values: {
                    date: new Date(selectedContent.createdAt)
                      .toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
                  }
                })}
              </span>
            </div>
          {/if}
        </div>

        <!-- Actions -->
        <div class="border-t border-gray-100 pt-4 flex gap-2">
          <a href="/projects/{projectId}/content"
            class="flex-1 text-center bg-primary-600 text-white py-2.5 rounded-lg text-sm
                   font-medium hover:bg-primary-700 transition-colors duration-150">
            {$_('calendar.viewDetails')}
          </a>
          <button on:click={() => selectedContent = null}
            class="px-5 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50
                   transition-colors duration-150 cursor-pointer">
            {$_('common.close')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Schedule content on date modal -->
{#if schedulingDate}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => schedulingDate = null}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100 flex items-center gap-2.5">
        <div class="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
        </div>
        <div>
          <h2 class="text-lg font-semibold text-gray-900">{$_('calendar.scheduleContent')}</h2>
          <p class="text-xs text-gray-500">
            {new Date(schedulingDate + 'T12:00:00').toLocaleDateString(undefined, {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            })}
          </p>
        </div>
      </div>
      <div class="p-6">
        <p class="text-sm text-gray-600 mb-3">{$_('calendar.selectContent')}</p>
        {#if unscheduledContents.length === 0}
          <div class="text-center py-8">
            <p class="text-sm text-gray-400">{$_('calendar.noUnscheduled')}</p>
          </div>
        {:else}
          <div class="space-y-2 max-h-[300px] overflow-y-auto">
            {#each unscheduledContents as content}
              <button
                on:click={() => scheduleContentOnDate(content.id)}
                disabled={scheduling}
                class="w-full text-left flex items-center gap-3 p-3 rounded-xl border
                       border-gray-200 hover:border-primary-300 hover:bg-primary-50/50
                       transition-colors duration-150 cursor-pointer disabled:opacity-50"
              >
                <span class="w-2 h-2 rounded-full flex-shrink-0
                  {statusDot[content.status]}"></span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-900 truncate">{content.title}</div>
                  <div class="text-xs text-gray-500">{content.type.replace('_', ' ')}</div>
                </div>
                <span class="text-[10px] px-1.5 py-0.5 rounded
                  {statusBadge[content.status]}">
                  {$_(statusLabel[content.status])}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <div class="p-6 border-t border-gray-100">
        <button on:click={() => schedulingDate = null}
          class="w-full py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50
                 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
