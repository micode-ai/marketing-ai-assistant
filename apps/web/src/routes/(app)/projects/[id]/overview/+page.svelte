<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { currentProjectStore, projectsStore } from '$lib/stores/projects';
  import { browser } from '$app/environment';
  import { get } from 'svelte/store';
  import { authStore } from '$stores/auth';
  import { API_URL } from '$lib/config';
  import type { Project, ProjectExportSection } from '@marketing-ai/shared-types';

  let summary: { contentCount: number; campaignCount: number; subscriberCount: number; checklistItems: number; checklistCount: number; contentCountAll: number; socialAccountCount: number } | null = null;
  let loading = true;
  $: projectId = $page.params['id'];

  // Sync picker with this project
  $: if ($projectsStore.length > 0 && projectId) {
    const project = $projectsStore.find((p: any) => p.id === projectId);
    if (project && $currentProjectStore?.id !== projectId) {
      currentProjectStore.set(project);
    }
  }

  // ── Export ──
  let showExportModal = false;
  let exporting = false;
  const exportSections: { key: ProjectExportSection; labelKey: string; iconPath: string }[] = [
    { key: 'content', labelKey: 'projectExport.sectionContent', iconPath: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z' },
    { key: 'campaigns', labelKey: 'projectExport.sectionCampaigns', iconPath: 'M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58' },
    { key: 'checklists', labelKey: 'projectExport.sectionChecklists', iconPath: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'documents', labelKey: 'projectExport.sectionDocuments', iconPath: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
    { key: 'emailLists', labelKey: 'projectExport.sectionEmailLists', iconPath: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25' },
    { key: 'keywords', labelKey: 'projectExport.sectionKeywords', iconPath: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z' },
    { key: 'competitors', labelKey: 'projectExport.sectionCompetitors', iconPath: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197' },
  ];
  let selectedExportSections: Set<ProjectExportSection> = new Set(exportSections.map(s => s.key));

  function toggleExportSection(key: ProjectExportSection) {
    if (selectedExportSections.has(key)) {
      selectedExportSections.delete(key);
    } else {
      selectedExportSections.add(key);
    }
    selectedExportSections = new Set(selectedExportSections);
  }

  function toggleAllExportSections() {
    if (selectedExportSections.size === exportSections.length) {
      selectedExportSections = new Set();
    } else {
      selectedExportSections = new Set(exportSections.map(s => s.key));
    }
  }

  async function doExport() {
    exporting = true;
    try {
      const sections = Array.from(selectedExportSections).join(',');
      const auth = get(authStore);
      const url = `${API_URL}/projects/${projectId}/export?sections=${sections}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const name = $currentProjectStore?.name?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'project';
      a.download = `${name}-export.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showExportModal = false;
    } catch (e: any) {
      alert(e.message || 'Export failed');
    } finally {
      exporting = false;
    }
  }

  onMount(async () => {
    if (!projectId) return;
    try {
      const [project, sum] = await Promise.all([
        api.get<Project>(`/projects/${projectId}`),
        api.get<any>('/analytics/summary', { projectId }),
      ]);
      currentProjectStore.set(project);
      summary = sum;
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });

  // Getting Started guide state — per-project dismissal via localStorage
  $: dismissed = browser
    ? localStorage.getItem(`gs_dismissed_${projectId}`) === 'true'
    : false;

  function dismissGuide() {
    dismissed = true;
    if (browser) localStorage.setItem(`gs_dismissed_${projectId}`, 'true');
  }

  $: gettingStartedItems = [
    {
      id: 'ai_strategy',
      labelKey: 'projects.gs.aiStrategy',
      descKey: 'projects.gs.aiStrategyDesc',
      href: `/ai-chat?prompt=${encodeURIComponent($_('projects.gs.aiStrategyPrompt'))}`,
      done: browser && localStorage.getItem(`gs_ai_strategy_${projectId}`) === 'true',
      external: true,
    },
    {
      id: 'first_content',
      labelKey: 'projects.gs.firstContent',
      descKey: 'projects.gs.firstContentDesc',
      href: 'content',
      done: (summary?.contentCountAll ?? 0) > 0,
      external: false,
    },
    {
      id: 'first_checklist',
      labelKey: 'projects.gs.firstChecklist',
      descKey: 'projects.gs.firstChecklistDesc',
      href: 'checklists',
      done: (summary?.checklistCount ?? 0) > 0,
      external: false,
    },
    {
      id: 'share_social',
      labelKey: 'projects.gs.shareContent',
      descKey: 'projects.gs.shareContentDesc',
      href: '/settings/integrations',
      done: (summary?.socialAccountCount ?? 0) > 0,
      external: true,
    },
  ];

  $: completedCount = gettingStartedItems.filter(i => i.done).length;
  $: allDone = completedCount === gettingStartedItems.length;

  $: quickActions = [
    {
      href: 'content', title: 'content.title', descKey: 'projects.quickActionDescs.content',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>`,
      color: 'text-violet-600 bg-violet-50',
    },
    {
      href: 'campaigns', title: 'projects.campaigns', descKey: 'projects.quickActionDescs.campaigns',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>`,
      color: 'text-green-600 bg-green-50',
    },
    {
      href: 'email', title: 'projects.email', descKey: 'projects.quickActionDescs.email',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>`,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      href: 'checklists', title: 'projects.checklists', descKey: 'projects.quickActionDescs.checklists',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
      color: 'text-orange-600 bg-orange-50',
    },
    {
      href: 'documents', title: 'projects.documents', descKey: 'projects.quickActionDescs.documents',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>`,
      color: 'text-slate-600 bg-slate-50',
    },
    {
      href: 'analytics', title: 'projects.analytics', descKey: 'projects.quickActionDescs.analytics',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>`,
      color: 'text-pink-600 bg-pink-50',
    },
  ];

  $: stats = [
    { labelKey: 'projects.totalContent', value: summary?.contentCount ?? '—', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>`, color: 'bg-blue-50 text-blue-600' },
    { labelKey: 'projects.activeCampaigns', value: summary?.campaignCount ?? '—', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>`, color: 'bg-green-50 text-green-600' },
    { labelKey: 'projects.emailSubscribers', value: summary?.subscriberCount ?? '—', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>`, color: 'bg-purple-50 text-purple-600' },
    { labelKey: 'projects.completedTasks', value: summary?.checklistItems ?? '—', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`, color: 'bg-orange-50 text-orange-600' },
  ];
</script>

<div class="p-4 sm:p-6">
  {#if $currentProjectStore}
    <div class="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6">
      <div class="flex items-center gap-4">
        <div class="w-14 h-14 bg-gradient-to-br from-primary-400 to-primary-700 rounded-2xl flex items-center justify-center text-white font-bold text-2xl flex-shrink-0">
          {$currentProjectStore.name.charAt(0)}
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{$currentProjectStore.name}</h1>
          <p class="text-sm text-gray-500 mt-0.5">{$currentProjectStore.projectType ? $_(`projects.types.${$currentProjectStore.projectType}`) : ''}{$currentProjectStore.industry ? ' · ' + $currentProjectStore.industry : ''}{$currentProjectStore.websiteUrl ? ' · ' + $currentProjectStore.websiteUrl : ''}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <button on:click={() => showExportModal = true} class="flex-1 sm:flex-initial px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {$_('common.export')}
        </button>
        <a href="/projects/{projectId}/settings" class="flex-1 sm:flex-initial px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {$_('projects.settingsBtn')}
        </a>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {#each stats as stat}
        <div class="bg-white rounded-xl border border-gray-200 p-4 border-t-4
          {stat.color.includes('blue') ? 'border-t-blue-400' :
           stat.color.includes('green') ? 'border-t-green-400' :
           stat.color.includes('purple') ? 'border-t-purple-400' : 'border-t-orange-400'}">
          <div class="flex items-center justify-between mb-3">
            <div class="w-9 h-9 {stat.color} rounded-lg flex items-center justify-center flex-shrink-0">
              {@html stat.icon}
            </div>
          </div>
          <div class="text-2xl font-bold text-gray-900">{loading ? '...' : stat.value}</div>
          <div class="text-xs text-gray-500 mt-1">{$_(stat.labelKey)}</div>
        </div>
      {/each}
    </div>

    <!-- AI Chat CTA -->
    <div class="bg-gradient-to-r from-primary-600 to-violet-600 rounded-xl p-5 mb-8 text-white">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-base">{$_('projects.askAI')}</h3>
            <p class="text-primary-100 text-sm mt-0.5">{$_('projects.askAIDesc')}</p>
          </div>
        </div>
        <a href="/ai-chat" class="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 backdrop-blur-sm whitespace-nowrap flex-shrink-0 cursor-pointer">
          {$_('projects.openChat')}
        </a>
      </div>
    </div>

    <!-- Getting Started guide — shown until dismissed or all items done -->
    {#if !dismissed && !allDone}
      <div class="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h2 class="text-base font-semibold text-gray-900">{$_('projects.gs.title')}</h2>
            <p class="text-xs text-gray-500 mt-0.5">
              {$_('projects.gs.progress', { values: { done: completedCount, total: gettingStartedItems.length } })}
            </p>
          </div>
          <button on:click={dismissGuide} class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer transition-colors duration-150">
            {$_('projects.gs.dismiss')}
          </button>
        </div>
        <!-- Progress bar -->
        <div class="w-full bg-gray-100 rounded-full h-1.5 mb-4">
          <div
            class="bg-primary-600 h-1.5 rounded-full transition-all duration-500"
            style="width: {(completedCount / gettingStartedItems.length) * 100}%"
          ></div>
        </div>
        <div class="space-y-2">
          {#each gettingStartedItems as item}
            <div class="flex items-center gap-3 p-3 rounded-lg {item.done ? 'bg-gray-50' : 'border border-gray-100'}">
              <!-- Circle check indicator -->
              <div class="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                {item.done ? 'bg-green-100 text-green-600' : 'border-2 border-gray-300'}">
                {#if item.done}
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium {item.done ? 'line-through text-gray-400' : 'text-gray-900'}">
                  {$_(item.labelKey)}
                </p>
                {#if !item.done}
                  <p class="text-xs text-gray-500 mt-0.5">{$_(item.descKey)}</p>
                {/if}
              </div>
              {#if !item.done}
                <a
                  href={item.external ? item.href : `/projects/${projectId}/${item.href}`}
                  class="text-xs font-medium text-primary-600 hover:text-primary-700 whitespace-nowrap cursor-pointer transition-colors duration-150"
                >
                  {$_('projects.gs.doItNow')} →
                </a>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Quick actions grid -->
    <h2 class="text-lg font-semibold text-gray-900 mb-4">{$_('projects.quickActions')}</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each quickActions as action}
        <a
          href="/projects/{projectId}/{action.href}"
          class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-primary-200 transition-all duration-150 group cursor-pointer"
        >
          <div class="w-11 h-11 {action.color} rounded-xl flex items-center justify-center mb-3 transition-colors duration-150">
            {@html action.icon}
          </div>
          <h3 class="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors duration-150">{$_(action.title)}</h3>
          <p class="text-sm text-gray-500 mt-1">{$_(action.descKey)}</p>
        </a>
      {/each}
    </div>
  {:else if loading}
    <div class="animate-pulse space-y-6">
      <div class="flex items-center gap-4">
        <div class="w-14 h-14 bg-gray-200 rounded-2xl"></div>
        <div class="flex-1">
          <div class="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
          <div class="h-4 bg-gray-200 rounded w-1/4"></div>
        </div>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {#each Array(4) as _}
          <div class="bg-gray-200 rounded-xl h-24"></div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<!-- Export Modal -->
{#if showExportModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showExportModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">{$_('projectExport.title')}</h3>
            <p class="text-sm text-gray-500">{$_('projectExport.description')}</p>
          </div>
        </div>
      </div>

      <div class="p-6">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm font-medium text-gray-700">{$_('projectExport.selectSections')}</p>
          <button on:click={toggleAllExportSections} class="text-xs text-primary-600 hover:text-primary-700 cursor-pointer">
            {selectedExportSections.size === exportSections.length ? $_('projectExport.deselectAll') : $_('projectExport.selectAll')}
          </button>
        </div>
        <div class="space-y-2">
          {#each exportSections as section}
            <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors duration-150
              {selectedExportSections.has(section.key) ? 'border-primary-200 bg-primary-50/50' : 'border-gray-200 hover:bg-gray-50'}">
              <input type="checkbox" checked={selectedExportSections.has(section.key)} on:change={() => toggleExportSection(section.key)}
                class="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500" />
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d={section.iconPath} />
              </svg>
              <span class="text-sm text-gray-700">{$_(section.labelKey)}</span>
            </label>
          {/each}
        </div>
      </div>

      <div class="p-6 border-t border-gray-100 flex justify-end gap-3">
        <button on:click={() => showExportModal = false} class="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors duration-150">
          {$_('common.cancel')}
        </button>
        <button on:click={doExport} disabled={exporting || selectedExportSections.size === 0}
          class="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 cursor-pointer transition-colors duration-150 flex items-center gap-2">
          {#if exporting}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            {$_('projectExport.downloading')}
          {:else}
            {$_('projectExport.exportBtn')}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
