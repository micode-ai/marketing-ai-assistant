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
    <a href="/projects/new" class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition flex items-center gap-2">
      <span>+</span> {$_('projects.create')}
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
      <div class="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center text-4xl mb-6">🚀</div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('projects.empty')}</h2>
      <p class="text-gray-500 mb-8 max-w-sm">{$_('projects.emptyDesc')}</p>
      <a href="/projects/new" class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition shadow-lg shadow-primary-200">
        {$_('projects.create')}
      </a>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each $projectsStore as project}
        <a
          href="/projects/{project.id}/overview"
          class="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-primary-200 transition-all group block"
        >
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              {#if project.logoUrl}
                <img src={project.logoUrl} alt={project.name} class="w-10 h-10 rounded-xl object-cover" />
              {:else}
                <div class="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-700 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                  {project.name.charAt(0)}
                </div>
              {/if}
              <div class="min-w-0">
                <h3 class="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors truncate">{project.name}</h3>
                <p class="text-xs text-gray-400">{project.industry || 'General'}</p>
              </div>
            </div>
            <span class="text-xs px-2 py-1 rounded-full flex-shrink-0 {project.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}">
              {project.status}
            </span>
          </div>

          {#if project.description}
            <p class="text-sm text-gray-500 mb-4 line-clamp-2">{project.description}</p>
          {/if}

          <div class="flex gap-4 text-xs text-gray-400 border-t border-gray-100 pt-4">
            <span>📝 {(project as any)._count?.content || 0}</span>
            <span>🚀 {(project as any)._count?.campaigns || 0}</span>
            <span>✅ {(project as any)._count?.checklists || 0}</span>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
