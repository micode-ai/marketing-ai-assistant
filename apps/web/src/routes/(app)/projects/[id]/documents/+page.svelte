<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  let documents: any[] = [];
  let loading = true;
  let showModal = false;
  let generating = false;
  $: projectId = $page.params['id'];
  let form = { type: 'MARKETING_PLAN', title: '' };

  onMount(async () => {
    documents = await api.get<any[]>('/documents', { projectId });
    loading = false;
  });

  async function generateDocument() {
    generating = true;
    try {
      await api.post('/agent/run', { projectId, agentType: 'DOCUMENT', input: { type: form.type, title: form.title || undefined } });
      documents = await api.get<any[]>('/documents', { projectId });
      showModal = false;
    } catch (e: any) { alert(e.message); }
    finally { generating = false; }
  }

  const icons: Record<string, string> = {
    MARKETING_PLAN: '📊', REPORT: '📈', COMPETITIVE_ANALYSIS: '🔍',
    BRAND_GUIDELINES: '🎨', CONTENT_CALENDAR: '📅', PROPOSAL: '📋', PRESENTATION: '🖥️',
  };
</script>

<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">{$_('documents.title')}</h1>
    <button on:click={() => showModal = true} class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition flex items-center gap-2">
      🤖 {$_('documents.generate')}
    </button>
  </div>

  {#if loading}
    <div class="grid grid-cols-2 gap-4">{#each Array(3) as _}<div class="bg-white rounded-xl border border-gray-200 h-28 animate-pulse"></div>{/each}</div>
  {:else if documents.length === 0}
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="text-5xl mb-4">📄</div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('documents.empty')}</h2>
      <p class="text-gray-500 mb-6">{$_('documents.emptyDesc')}</p>
      <button on:click={() => showModal = true} class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition">
        🤖 {$_('documents.generate')}
      </button>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each documents as doc}
        <div class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition cursor-pointer hover:border-primary-200">
          <div class="flex items-start gap-4">
            <div class="text-3xl">{icons[doc.type] || '📄'}</div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-gray-900 truncate">{doc.title}</h3>
              <div class="flex items-center gap-2 mt-1.5">
                <span class="text-xs text-gray-400">{doc.type.replace(/_/g, ' ')}</span>
                {#if doc.generatedByAi}<span class="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">🤖 AI</span>{/if}
                <span class="text-xs text-gray-400">v{doc.version}</span>
              </div>
              <p class="text-xs text-gray-400 mt-1">{new Date(doc.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <h2 class="text-lg font-semibold mb-4">🤖 {$_('documents.generate')}</h2>
      <div class="space-y-4 mb-6">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{$_('documents.type')}</label>
          <select bind:value={form.type} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="MARKETING_PLAN">{$_('documents.marketingPlan')}</option>
            <option value="REPORT">{$_('documents.report')}</option>
            <option value="COMPETITIVE_ANALYSIS">{$_('documents.competitiveAnalysis')}</option>
            <option value="BRAND_GUIDELINES">{$_('documents.brandGuidelines')}</option>
            <option value="CONTENT_CALENDAR">{$_('documents.contentCalendar')}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Custom Title ({$_('common.optional')})</label>
          <input type="text" bind:value={form.title} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Leave blank for auto-title" />
        </div>
      </div>
      <div class="flex gap-3">
        <button on:click={generateDocument} disabled={generating} class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition text-sm">
          {generating ? '⏳ ' + $_('documents.generating') : '🤖 ' + $_('documents.generate')}
        </button>
        <button on:click={() => showModal = false} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm">{$_('common.cancel')}</button>
      </div>
    </div>
  </div>
{/if}
