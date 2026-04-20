<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { api } from '$lib/api/client';
  import { currentProjectStore, organizationIdStore, projectsStore } from '$lib/stores/projects';
  import type { Project, ProjectExportData, ProjectExportSection, ImportValidationResult } from '@marketing-ai/shared-types';
  import { goto } from '$app/navigation';
  import DashboardKpiCards from '$lib/components/DashboardKpiCards.svelte';
  import ProjectCardStats from '$lib/components/ProjectCardStats.svelte';

  $: projects = $projectsStore;

  // ── Dashboard stats ──
  type ProjectStats = { content: number; emailsSent: number; pageViews: number; conversions: number };
  type OrgSummaryResponse = {
    byProject: Array<{ projectId: string; projectName: string } & ProjectStats>;
  };

  let period: 7 | 30 | 90 = 30;
  let projectStats: Record<string, ProjectStats> = {};
  let projectStatsLoading = false;
  let previousPeriod: 7 | 30 | 90 = period;
  let lastLoadedOrg: string | null = null;

  $: if ($organizationIdStore && ($organizationIdStore !== lastLoadedOrg || period !== previousPeriod)) {
    lastLoadedOrg = $organizationIdStore;
    previousPeriod = period;
    loadByProject();
  }

  async function loadByProject() {
    if (!$organizationIdStore) return;
    projectStatsLoading = true;
    try {
      const res = await api.get<OrgSummaryResponse>('/analytics/organization', {
        organizationId: $organizationIdStore,
        period: `${period}d`,
      });
      const next: Record<string, ProjectStats> = {};
      for (const row of res.byProject || []) {
        next[row.projectId] = {
          content: row.content,
          emailsSent: row.emailsSent,
          pageViews: row.pageViews,
          conversions: row.conversions,
        };
      }
      projectStats = next;
    } catch {
      // Keep previous stats to avoid visual glitch; but mark empty on first failure
      if (Object.keys(projectStats).length === 0) projectStats = {};
    } finally {
      projectStatsLoading = false;
    }
  }

  // ── Import ──
  let showImportModal = false;
  let importStep: 'upload' | 'preview' = 'upload';
  let importError = '';
  let importing = false;
  let validating = false;
  let importData: ProjectExportData | null = null;
  let importValidation: ImportValidationResult | null = null;
  let selectedImportSections: Set<ProjectExportSection> = new Set();

  const sectionLabels: Record<ProjectExportSection, string> = {
    content: 'projectImport.sectionContent',
    campaigns: 'projectImport.sectionCampaigns',
    checklists: 'projectImport.sectionChecklists',
    documents: 'projectImport.sectionDocuments',
    emailLists: 'projectImport.sectionEmailLists',
    keywords: 'projectImport.sectionKeywords',
    competitors: 'projectImport.sectionCompetitors',
  };

  function resetImport() {
    importStep = 'upload';
    importError = '';
    importData = null;
    importValidation = null;
    selectedImportSections = new Set();
  }

  function handleImportFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      importError = $_('projectImport.errorInvalidFile');
      return;
    }

    importError = '';
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text) as ProjectExportData;
        importData = parsed;

        // Validate
        validating = true;
        try {
          const result = await api.post<ImportValidationResult>('/projects/import/validate', { data: parsed });
          importValidation = result;
          if (!result.valid) {
            importError = result.errors.join('; ');
            return;
          }
          // Pre-select all available sections
          selectedImportSections = new Set(
            Object.keys(result.summary) as ProjectExportSection[]
          );
          importStep = 'preview';
        } catch (err: any) {
          importError = err.message || $_('projectImport.errorParseFailed');
        } finally {
          validating = false;
        }
      } catch {
        importError = $_('projectImport.errorParseFailed');
      }
    };
    reader.readAsText(file);
  }

  function toggleImportSection(key: ProjectExportSection) {
    if (selectedImportSections.has(key)) {
      selectedImportSections.delete(key);
    } else {
      selectedImportSections.add(key);
    }
    selectedImportSections = new Set(selectedImportSections);
  }

  async function doImport() {
    if (!importData || !$organizationIdStore) return;
    importing = true;
    try {
      const result = await api.post<Project>('/projects/import', {
        organizationId: $organizationIdStore,
        data: importData,
        sections: Array.from(selectedImportSections),
      });
      // Reload projects
      const projects = await api.get<Project[]>('/projects', { organizationId: $organizationIdStore });
      projectsStore.set(projects);
      showImportModal = false;
      resetImport();
      goto(`/projects/${result.id}/overview`);
    } catch (e: any) {
      importError = e.message || 'Import failed';
    } finally {
      importing = false;
    }
  }
</script>

<div class="p-4 sm:p-6">
  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{$_('nav.dashboard')}</h1>
      <p class="text-sm text-gray-500 mt-1">{$_('projects.manageDesc')}</p>
    </div>
    <div class="flex items-center gap-2 w-full sm:w-auto">
      <button on:click={() => { resetImport(); showImportModal = true; }} class="flex-1 sm:flex-initial justify-center px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 flex items-center gap-2 cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        {$_('common.import')}
      </button>
      <a href="/projects/new" class="flex-1 sm:flex-initial justify-center bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('projects.create')}
      </a>
    </div>
  </div>

  {#if $projectsStore.length > 0 && $organizationIdStore}
    <DashboardKpiCards organizationId={$organizationIdStore} bind:period />
  {/if}

  {#if $projectsStore.length === 0}
    <div class="flex flex-col items-center justify-center py-24 text-center">
      <div class="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('projects.empty')}</h2>
      <p class="text-gray-500 mb-8 max-w-sm">{$_('projects.emptyDesc')}</p>
      <a href="/projects/new" class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition-colors duration-150 shadow-lg shadow-primary-200 cursor-pointer">
        {$_('projects.create')}
      </a>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each $projectsStore as project}
        <a
          href="/projects/{project.id}/overview"
          on:click={() => currentProjectStore.set(project)}
          class="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-primary-200 transition-all duration-150 group cursor-pointer border-t-4 flex flex-col h-full
            {project.status === 'ACTIVE' ? 'border-t-green-400' : project.status === 'PAUSED' ? 'border-t-amber-400' : 'border-t-gray-200'}"
        >
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3 min-w-0">
              {#if project.logoUrl}
                <img src={project.logoUrl} alt={project.name} class="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
              {:else}
                <div class="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-700 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {project.name.charAt(0)}
                </div>
              {/if}
              <div class="min-w-0">
                <h3 class="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors duration-150 truncate">{project.name}</h3>
                <p class="text-xs text-gray-400 truncate">{project.industry || $_('common.overview')}</p>
              </div>
            </div>
            <span class="text-xs px-2 py-1 rounded-full flex-shrink-0 ml-2 flex items-center gap-1
              {project.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}">
              <span class="w-1.5 h-1.5 rounded-full flex-shrink-0 {project.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'}"></span>
              {project.status === 'ACTIVE' ? $_('projects.active') : project.status === 'PAUSED' ? $_('projects.paused') : $_('projects.archived')}
            </span>
          </div>

          {#if project.description}
            <p class="text-sm text-gray-500 mb-4 line-clamp-2">{project.description}</p>
          {/if}

          <div class="flex gap-4 text-xs text-gray-400 border-t border-gray-100 pt-4 mt-auto">
            <span class="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
              {(project as any)._count?.content || 0}
            </span>
            <span class="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>
              {(project as any)._count?.campaigns || 0}
            </span>
            <span class="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {(project as any)._count?.checklists || 0}
            </span>
          </div>

          <ProjectCardStats stats={projectStats[project.id]} {period} loading={projectStatsLoading} />
        </a>
      {/each}
    </div>
  {/if}
</div>

<!-- Import Modal -->
{#if showImportModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showImportModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">{$_('projectImport.title')}</h3>
            <p class="text-sm text-gray-500">{$_('projectImport.description')}</p>
          </div>
        </div>
      </div>

      <div class="p-6">
        {#if importStep === 'upload'}
          <!-- Upload step -->
          <label class="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors duration-150">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9.75m3 0l-3-3m0 0l-3 3m3-3v6.75" />
            </svg>
            <p class="text-sm text-gray-600 font-medium">{$_('projectImport.uploadFile')}</p>
            <p class="text-xs text-gray-400 mt-1">{$_('projectImport.uploadHint')}</p>
            <input type="file" accept=".json" class="hidden" on:change={handleImportFile} />
          </label>
          {#if validating}
            <div class="flex items-center gap-2 mt-4 text-sm text-gray-500">
              <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              {$_('projectImport.validating')}
            </div>
          {/if}
          {#if importError}
            <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{importError}</div>
          {/if}

        {:else if importStep === 'preview'}
          <!-- Preview step -->
          <div class="mb-4">
            <div class="flex items-center gap-2 mb-1">
              <div class="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-700 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {importValidation?.projectName?.charAt(0) || 'P'}
              </div>
              <div>
                <p class="text-sm font-semibold text-gray-900">{importValidation?.projectName}</p>
                <p class="text-xs text-gray-500">{$_('projectImport.previewDesc')}</p>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            {#each Object.entries(importValidation?.summary || {}) as [section, count]}
              <label class="flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors duration-150
                {selectedImportSections.has(section) ? 'border-primary-200 bg-primary-50/50' : 'border-gray-200 hover:bg-gray-50'}">
                <div class="flex items-center gap-3">
                  <input type="checkbox" checked={selectedImportSections.has(section)} on:change={() => toggleImportSection(section)}
                    class="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500" />
                  <span class="text-sm text-gray-700">{$_(sectionLabels[section] || section)}</span>
                </div>
                <span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{count}</span>
              </label>
            {/each}
          </div>

          {#if importError}
            <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{importError}</div>
          {/if}
        {/if}
      </div>

      <div class="p-6 border-t border-gray-100 flex justify-end gap-3">
        {#if importStep === 'preview'}
          <button on:click={() => { importStep = 'upload'; importError = ''; }} class="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors duration-150">
            {$_('common.back')}
          </button>
        {/if}
        <button on:click={() => showImportModal = false} class="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors duration-150">
          {$_('common.cancel')}
        </button>
        {#if importStep === 'preview'}
          <button on:click={doImport} disabled={importing || selectedImportSections.size === 0}
            class="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer transition-colors duration-150 flex items-center gap-2">
            {#if importing}
              <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              {$_('projectImport.importing')}
            {:else}
              {$_('projectImport.importBtn')}
            {/if}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
