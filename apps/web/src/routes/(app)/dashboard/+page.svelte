<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore, projectsStore } from '$lib/stores/projects';
  import type { Project } from '@marketing-ai/shared-types';
  import { goto } from '$app/navigation';

  let loading = true;

  onMount(async () => {
    if ($organizationIdStore) {
      try {
        const projects = await api.get<Project[]>('/projects', { organizationId: $organizationIdStore });
        projectsStore.set(projects);
      } catch (e) {
        console.error('Failed to load projects', e);
      }
    }
    loading = false;
  });
</script>

<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{$_('nav.dashboard')}</h1>
      <p class="text-sm text-gray-500 mt-1">{$_('projects.manageDesc')}</p>
    </div>
    <a href="/projects/new" class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      {$_('projects.create')}
    </a>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each Array(3) as _}
        <div class="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-gray-200 rounded-lg"></div>
            <div class="flex-1">
              <div class="h-4 bg-gray-200 rounded w-3/4 mb-1"></div>
              <div class="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
          <div class="h-3 bg-gray-200 rounded mb-2"></div>
          <div class="h-3 bg-gray-200 rounded w-2/3"></div>
        </div>
      {/each}
    </div>
  {:else if $projectsStore.length === 0}
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
          class="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-primary-200 transition-all duration-150 group block cursor-pointer border-t-4
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

          <div class="flex gap-4 text-xs text-gray-400 border-t border-gray-100 pt-4">
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
        </a>
      {/each}
    </div>
  {/if}
</div>
