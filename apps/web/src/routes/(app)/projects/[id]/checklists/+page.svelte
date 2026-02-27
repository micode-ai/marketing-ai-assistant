<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  let checklists: any[] = [];
  let loading = true;
  let showModal = false;
  let creating = false;
  $: projectId = $page.params['id'];
  let form = { type: 'LAUNCH' };

  onMount(async () => {
    checklists = await api.get<any[]>('/checklists', { projectId });
    loading = false;
  });

  async function generateWithAI() {
    creating = true;
    try {
      const run = await api.post<{ id: string; status: string }>('/agent/run', { projectId, agentType: 'CHECKLIST', input: { type: form.type } });

      // Poll until agent run completes (async queue processing)
      let attempts = 0;
      while (attempts < 60) {
        await new Promise(r => setTimeout(r, 2000));
        const updated = await api.get<{ status: string; error?: string }>(`/agent/runs/${run.id}`);
        if (updated.status === 'COMPLETED') break;
        if (updated.status === 'FAILED') throw new Error(updated.error || 'Agent run failed');
        attempts++;
      }
      if (attempts >= 60) throw new Error('Timeout waiting for AI generation');

      checklists = await api.get<any[]>('/checklists', { projectId });
      showModal = false;
    } catch (e: any) { alert(e.message); }
    finally { creating = false; }
  }

  async function toggleItem(checklistId: string, itemId: string, isCompleted: boolean) {
    await api.put(`/checklists/items/${itemId}`, { isCompleted });
    checklists = checklists.map(c =>
      c.id === checklistId
        ? { ...c, items: c.items.map((i: any) => i.id === itemId ? { ...i, isCompleted } : i) }
        : c
    );
  }

  const priorityDot: Record<string, string> = {
    LOW: 'bg-gray-300',
    MEDIUM: 'bg-blue-400',
    HIGH: 'bg-orange-400',
    CRITICAL: 'bg-red-500',
  };
</script>

<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">{$_('checklists.title')}</h1>
    <button on:click={() => showModal = true} class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition flex items-center gap-2">
      🤖 {$_('checklists.generateWithAI')}
    </button>
  </div>

  {#if loading}
    <div class="space-y-4">{#each Array(2) as _}<div class="bg-white rounded-xl border border-gray-200 p-6 h-48 animate-pulse"></div>{/each}</div>
  {:else if checklists.length === 0}
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="text-5xl mb-4">✅</div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('checklists.empty')}</h2>
      <p class="text-gray-500 mb-6 max-w-sm">{$_('checklists.emptyDesc')}</p>
      <button on:click={() => showModal = true} class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition">
        🤖 {$_('checklists.generateWithAI')}
      </button>
    </div>
  {:else}
    <div class="space-y-6">
      {#each checklists as checklist}
        {@const items = checklist.items || []}
        {@const completed = items.filter((i: any) => i.isCompleted).length}
        {@const total = items.length}
        {@const progress = total > 0 ? Math.round((completed / total) * 100) : 0}
        <div class="bg-white rounded-xl border border-gray-200 p-6">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h3 class="font-semibold text-gray-900 text-lg">{checklist.name}</h3>
              {#if checklist.description}<p class="text-sm text-gray-500 mt-0.5">{checklist.description}</p>{/if}
            </div>
            <div class="text-right flex-shrink-0 ml-4">
              <div class="text-xl font-bold text-primary-600">{progress}%</div>
              <div class="text-xs text-gray-400">{completed}/{total} done</div>
            </div>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-1.5 mb-5">
            <div class="bg-primary-600 h-1.5 rounded-full transition-all duration-500" style="width: {progress}%"></div>
          </div>
          <ul class="space-y-2">
            {#each items as item}
              <li class="flex items-start gap-3">
                <button
                  on:click={() => toggleItem(checklist.id, item.id, !item.isCompleted)}
                  class="mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all {item.isCompleted ? 'bg-primary-600 border-primary-600' : 'border-gray-300 hover:border-primary-400'}"
                >
                  {#if item.isCompleted}
                    <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                  {/if}
                </button>
                <div class="flex-1 min-w-0">
                  <span class="text-sm {item.isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}">{item.title}</span>
                  {#if item.description && !item.isCompleted}
                    <p class="text-xs text-gray-400 mt-0.5">{item.description}</p>
                  {/if}
                </div>
                <div class="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 {priorityDot[item.priority] || 'bg-gray-300'}" title={item.priority}></div>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <h2 class="text-lg font-semibold mb-4">🤖 {$_('checklists.generateWithAI')}</h2>
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-1">{$_('checklists.type')}</label>
        <select bind:value={form.type} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="LAUNCH">{$_('checklists.launch')}</option>
          <option value="WEEKLY">{$_('checklists.weekly')}</option>
          <option value="CAMPAIGN_PREP">{$_('checklists.campaignPrep')}</option>
          <option value="SEO">{$_('checklists.seo')}</option>
          <option value="SOCIAL_MEDIA">{$_('checklists.socialMedia')}</option>
          <option value="EMAIL_CAMPAIGN">{$_('checklists.emailCampaign')}</option>
          <option value="COMPETITIVE_ANALYSIS">{$_('checklists.competitiveAnalysis')}</option>
        </select>
      </div>
      <div class="flex gap-3">
        <button on:click={generateWithAI} disabled={creating} class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition text-sm">
          {creating ? $_('common.loading') : '🤖 ' + $_('checklists.generateWithAI')}
        </button>
        <button on:click={() => showModal = false} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm">{$_('common.cancel')}</button>
      </div>
    </div>
  </div>
{/if}
