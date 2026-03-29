<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { organizationIdStore, projectsStore } from '$lib/stores/projects';
  import { api } from '$lib/api/client';

  let loading = true;
  let contentItems: any[] = [];
  let campaignItems: any[] = [];

  // Calendar state
  let currentDate = new Date();
  $: currentYear = currentDate.getFullYear();
  $: currentMonth = currentDate.getMonth();
  $: monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  $: orgId = $organizationIdStore;
  $: projects = $projectsStore;

  // Build a color map for projects
  const projectColors = [
    'bg-blue-200 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    'bg-green-200 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    'bg-purple-200 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    'bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    'bg-pink-200 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
    'bg-cyan-200 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
    'bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    'bg-indigo-200 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  ];

  function getProjectColor(projectId: string): string {
    const idx = projects.findIndex((p) => p.id === projectId);
    return projectColors[idx >= 0 ? idx % projectColors.length : 0];
  }

  function getProjectName(projectId: string): string {
    return projects.find((p) => p.id === projectId)?.name || 'Unknown';
  }

  // Calendar grid helpers
  $: firstDay = new Date(currentYear, currentMonth, 1).getDay();
  $: daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  $: calendarDays = buildCalendarDays(firstDay, daysInMonth);

  function buildCalendarDays(first: number, total: number): (number | null)[] {
    const days: (number | null)[] = [];
    // Leading empty cells (Sunday = 0)
    for (let i = 0; i < first; i++) days.push(null);
    for (let d = 1; d <= total; d++) days.push(d);
    // Trailing empty cells
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }

  // Events grouped by day
  $: eventsByDay = buildEventsByDay(contentItems, campaignItems, currentYear, currentMonth);

  function buildEventsByDay(content: any[], campaigns: any[], year: number, month: number): Map<number, any[]> {
    const map = new Map<number, any[]>();
    for (const item of content) {
      if (!item.scheduledAt) continue;
      const d = new Date(item.scheduledAt);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push({ type: 'content', title: item.title, projectId: item.projectId });
      }
    }
    for (const item of campaigns) {
      const dateStr = item.startDate || item.scheduledAt;
      if (!dateStr) continue;
      const d = new Date(dateStr);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push({ type: 'campaign', title: item.name, projectId: item.projectId });
      }
    }
    return map;
  }

  function prevMonth() {
    currentDate = new Date(currentYear, currentMonth - 1, 1);
  }

  function nextMonth() {
    currentDate = new Date(currentYear, currentMonth + 1, 1);
  }

  async function loadData() {
    if (!orgId) return;
    loading = true;
    try {
      const params = { organizationId: orgId, aggregated: 'true' };
      const [content, campaigns] = await Promise.all([
        api.get<any[]>('/content', params),
        api.get<any[]>('/campaigns', params),
      ]);
      contentItems = content;
      campaignItems = campaigns;
    } catch (e) {
      console.error('Failed to load calendar data:', e);
      contentItems = [];
      campaignItems = [];
    } finally {
      loading = false;
    }
  }

  $: orgId && loadData();

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
</script>

<div class="p-4 sm:p-6">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{$_('nav.orgCalendar')}</h1>
  </div>

  <!-- Month Navigation -->
  <div class="flex items-center justify-between mb-4">
    <button
      class="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
      on:click={prevMonth}
    >
      &larr;
    </button>
    <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{monthName}</h2>
    <button
      class="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
      on:click={nextMonth}
    >
      &rarr;
    </button>
  </div>

  {#if loading}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  {:else}
    <!-- Calendar Grid -->
    <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <!-- Weekday Headers -->
      <div class="grid grid-cols-7 bg-gray-50 dark:bg-gray-800">
        {#each weekdays as day}
          <div class="px-2 py-2 text-xs font-medium text-center text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            {day}
          </div>
        {/each}
      </div>

      <!-- Day Cells -->
      <div class="grid grid-cols-7">
        {#each calendarDays as day}
          <div class="min-h-[80px] sm:min-h-[100px] border-b border-r border-gray-100 dark:border-gray-700 p-1 {day === null ? 'bg-gray-50/50 dark:bg-gray-900/30' : ''}">
            {#if day !== null}
              <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{day}</div>
              {#if eventsByDay.has(day)}
                <div class="space-y-0.5">
                  {#each (eventsByDay.get(day) || []).slice(0, 3) as event}
                    <div class="text-[10px] sm:text-xs px-1 py-0.5 rounded truncate {getProjectColor(event.projectId)}"
                      title="{event.title} ({getProjectName(event.projectId)})">
                      {event.type === 'campaign' ? '📢' : '📝'} {event.title}
                    </div>
                  {/each}
                  {#if (eventsByDay.get(day) || []).length > 3}
                    <div class="text-[10px] text-gray-400 dark:text-gray-500 px-1">
                      +{(eventsByDay.get(day) || []).length - 3} more
                    </div>
                  {/if}
                </div>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Legend -->
    {#if projects.length > 0}
      <div class="mt-4 flex flex-wrap gap-2">
        {#each projects as project, i}
          <span class="text-xs px-2 py-1 rounded-full {projectColors[i % projectColors.length]}">
            {project.name}
          </span>
        {/each}
      </div>
    {/if}
  {/if}
</div>
