<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { organizationIdStore, currentProjectStore } from '$lib/stores/projects';
  import { contextStore } from '$lib/stores/context';
  import { currentUser } from '$lib/stores/auth';
  import { api } from '$lib/api/client';

  let items: any[] = [];
  let loading = true;

  $: ctx = $contextStore;
  $: memberships = ($currentUser as any)?.memberships || [];
  $: currentOrg = memberships.find((m: any) => m.organization?.id === $organizationIdStore)?.organization;

  async function loadData() {
    if (!ctx.organizationId) return;
    loading = true;
    try {
      const params: Record<string, string> = ctx.type === 'project' && ctx.projectId
        ? { projectId: ctx.projectId }
        : { organizationId: ctx.organizationId };
      const res = await api.get<any[]>('/content', params);
      items = res;
    } catch (e) {
      console.error('Failed to load content:', e);
      items = [];
    } finally {
      loading = false;
    }
  }

  $: $contextStore, loadData();

  interface ContentGroup { groupId: string | null; items: any[]; }

  function groupContents(list: any[]): ContentGroup[] {
    const groups = new Map<string, any[]>();
    const standalone: ContentGroup[] = [];
    for (const item of list) {
      if (item.contentGroupId) {
        if (!groups.has(item.contentGroupId)) groups.set(item.contentGroupId, []);
        groups.get(item.contentGroupId)!.push(item);
      } else {
        standalone.push({ items: [item], groupId: null });
      }
    }
    return [
      ...Array.from(groups.entries()).map(([groupId, grpItems]) => ({
        groupId,
        items: grpItems.sort((a: any, b: any) => (a.language || '').localeCompare(b.language || ''))
      })),
      ...standalone,
    ];
  }

  $: groupedItems = groupContents(items);

  let expandedGroups = new Set<string>();
  function toggleGroup(gid: string) {
    if (expandedGroups.has(gid)) expandedGroups.delete(gid);
    else expandedGroups.add(gid);
    expandedGroups = expandedGroups;
  }

  const langBadge: Record<string, string> = {
    en: 'bg-blue-100 text-blue-700',
    pl: 'bg-red-100 text-red-700',
    ru: 'bg-green-100 text-green-700',
  };
</script>

<div class="p-4 sm:p-6">
  <div class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mb-1">
    <span>{currentOrg?.name || $_('header.orgContext')}</span>
    {#if $currentProjectStore}
      <span class="text-gray-300">›</span>
      <span class="text-indigo-600 dark:text-indigo-400">{$currentProjectStore.name}</span>
    {/if}
    <span class="text-gray-300">›</span>
    <span class="text-gray-700 dark:text-gray-200">{$_('nav.orgContent')}</span>
  </div>

  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{$_('nav.orgContent')}</h1>
    {#if $currentProjectStore}
      <a href="/projects/{$currentProjectStore.id}/content" class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
        + {$_('common.create')}
      </a>
    {:else}
      <button disabled class="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed" title={$_('common.selectProjectToCreate')}>
        + {$_('common.create')}
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  {:else if items.length === 0}
    <div class="text-center py-12 text-gray-500 dark:text-gray-400">
      <p>{$_('common.noData')}</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each groupedItems as group}
        {#if group.items.length > 1 && group.groupId}
          <!-- Grouped multilingual content -->
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all">
            <div class="p-4 cursor-pointer" on:click={() => toggleGroup(group.groupId)}>
              <div class="flex items-center justify-between">
                <div>
                  <div class="flex items-center gap-1.5 mb-1">
                    {#each group.items as gi}
                      <span class="text-xs px-1.5 py-0.5 rounded font-medium {langBadge[gi.language] || 'bg-gray-100 text-gray-600'}">{(gi.language || '?').toUpperCase()}</span>
                    {/each}
                    <span class="text-xs text-gray-400">{group.items[0].type || ''} · {group.items[0].status || ''}</span>
                  </div>
                  <h3 class="font-medium text-gray-900 dark:text-white">{group.items[0].title}</h3>
                </div>
                <div class="flex items-center gap-2">
                  {#if ctx.type === 'organization'}
                    <span class="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {group.items[0].projectName || $_('org.scopeProject')}
                    </span>
                  {/if}
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-400 transition-transform {expandedGroups.has(group.groupId) ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>
            </div>
            {#if expandedGroups.has(group.groupId)}
              <div class="border-t border-gray-200 dark:border-gray-700">
                {#each group.items as item}
                  <a href="/projects/{item.projectId}/content?focus={item.id}" class="block p-4 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <div class="flex items-center gap-2">
                      <span class="text-xs px-1.5 py-0.5 rounded font-bold {langBadge[item.language] || 'bg-gray-100 text-gray-600'}">{(item.language || '?').toUpperCase()}</span>
                      <h3 class="font-medium text-gray-900 dark:text-white">{item.title}</h3>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{item.body?.substring(0, 150)}</p>
                  </a>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <!-- Single content item -->
          {@const item = group.items[0]}
          <a href="/projects/{item.projectId}/content?focus={item.id}" class="block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all cursor-pointer">
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-1.5 mb-1">
                  {#if item.language}
                    <span class="text-xs px-1.5 py-0.5 rounded font-medium {langBadge[item.language] || 'bg-gray-100 text-gray-600'}">{item.language.toUpperCase()}</span>
                  {/if}
                </div>
                <h3 class="font-medium text-gray-900 dark:text-white">{item.title}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">{item.type || ''}{item.status ? ' · ' + item.status : ''}</p>
              </div>
              {#if ctx.type === 'organization'}
                <span class="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {item.projectName || $_('org.scopeProject')}
                </span>
              {/if}
            </div>
          </a>
        {/if}
      {/each}
    </div>
  {/if}
</div>
