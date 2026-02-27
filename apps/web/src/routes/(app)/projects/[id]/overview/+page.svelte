<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { currentProjectStore } from '$lib/stores/projects';
  import type { Project } from '@marketing-ai/shared-types';

  let summary: { contentCount: number; campaignCount: number; subscriberCount: number; checklistItems: number } | null = null;
  let loading = true;
  $: projectId = $page.params['id'];

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

  const quickActions = [
    { href: 'content', icon: '✍️', title: 'content.title', desc: 'Generate and manage content with AI' },
    { href: 'campaigns', icon: '🚀', title: 'projects.campaigns', desc: 'Plan and track marketing campaigns' },
    { href: 'email', icon: '📧', title: 'projects.email', desc: 'Email lists and campaigns' },
    { href: 'checklists', icon: '✅', title: 'projects.checklists', desc: 'Track marketing tasks' },
    { href: 'documents', icon: '📄', title: 'projects.documents', desc: 'AI-generated marketing docs' },
    { href: 'analytics', icon: '📈', title: 'projects.analytics', desc: 'Performance metrics' },
  ];
</script>

<div class="p-6">
  {#if $currentProjectStore}
    <div class="flex items-start justify-between mb-6">
      <div class="flex items-center gap-4">
        <div class="w-14 h-14 bg-gradient-to-br from-primary-400 to-primary-700 rounded-2xl flex items-center justify-center text-white font-bold text-2xl">
          {$currentProjectStore.name.charAt(0)}
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{$currentProjectStore.name}</h1>
          <p class="text-sm text-gray-500 mt-0.5">{$currentProjectStore.industry || ''} {$currentProjectStore.websiteUrl ? '· ' + $currentProjectStore.websiteUrl : ''}</p>
        </div>
      </div>
      <a href="/projects/{projectId}/settings" class="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
        ⚙️ Settings
      </a>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {#each [
        { label: $_('projects.totalContent'), value: summary?.contentCount ?? '—', icon: '📝', color: 'bg-blue-50 text-blue-600' },
        { label: $_('projects.activeCampaigns'), value: summary?.campaignCount ?? '—', icon: '🚀', color: 'bg-green-50 text-green-600' },
        { label: $_('projects.emailSubscribers'), value: summary?.subscriberCount ?? '—', icon: '📧', color: 'bg-purple-50 text-purple-600' },
        { label: $_('projects.completedTasks'), value: summary?.checklistItems ?? '—', icon: '✅', color: 'bg-orange-50 text-orange-600' },
      ] as stat}
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="w-9 h-9 {stat.color} rounded-lg flex items-center justify-center text-lg">{stat.icon}</div>
          </div>
          <div class="text-2xl font-bold text-gray-900">{loading ? '...' : stat.value}</div>
          <div class="text-xs text-gray-500 mt-1">{stat.label}</div>
        </div>
      {/each}
    </div>

    <!-- AI Chat CTA -->
    <div class="bg-gradient-to-r from-primary-600 to-violet-600 rounded-xl p-5 mb-8 text-white">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="font-semibold text-lg">🤖 Ask AI Marketing Assistant</h3>
          <p class="text-primary-100 text-sm mt-1">Get marketing advice, generate content, analyze performance</p>
        </div>
        <a href="/ai-chat" class="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium transition backdrop-blur-sm">
          Open Chat →
        </a>
      </div>
    </div>

    <!-- Quick actions grid -->
    <h2 class="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each quickActions as action}
        <a
          href="/projects/{projectId}/{action.href}"
          class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-primary-200 transition-all group"
        >
          <div class="text-3xl mb-3">{action.icon}</div>
          <h3 class="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">{$_(action.title)}</h3>
          <p class="text-sm text-gray-500 mt-1">{action.desc}</p>
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
      <div class="grid grid-cols-4 gap-4">
        {#each Array(4) as _}
          <div class="bg-gray-200 rounded-xl h-24"></div>
        {/each}
      </div>
    </div>
  {/if}
</div>
