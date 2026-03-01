<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { api } from '$lib/api/client';
  import { marked } from 'marked';

  // Configure marked for inline rendering (no wrapping <p> tags for short content)
  marked.setOptions({ breaks: true, gfm: true });

  function renderMarkdown(text: string): string {
    return marked.parse(text, { async: false }) as string;
  }

  let checklists: any[] = [];
  let loading = true;
  let showModal = false;
  let creating = false;
  let expandedItems = new Set<string>();
  $: projectId = $page.params['id'];
  let form = { type: 'LAUNCH' };

  function toggleExpand(itemId: string) {
    if (expandedItems.has(itemId)) {
      expandedItems.delete(itemId);
    } else {
      expandedItems.add(itemId);
      ensureItemChat(itemId);
    }
    expandedItems = expandedItems;
  }

  // Initialize itemChats from DB data after checklists load
  function initChatsFromDB() {
    for (const checklist of checklists) {
      for (const item of checklist.items || []) {
        if (item.chatMessages && Array.isArray(item.chatMessages) && item.chatMessages.length > 0) {
          itemChats[item.id] = {
            messages: item.chatMessages,
            input: '',
            loading: false,
          };
        }
      }
    }
    itemChats = itemChats;
  }

  onMount(async () => {
    checklists = await api.get<any[]>('/checklists', { projectId });
    initChatsFromDB();
    loading = false;
  });

  async function generateWithAI() {
    creating = true;
    try {
      const run = await api.post<{ id: string; status: string }>('/agent/run', { projectId, agentType: 'CHECKLIST', input: { type: form.type, language: $locale } });

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
      initChatsFromDB();
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

  let deletingId: string | null = null;

  async function deleteChecklist(id: string) {
    try {
      await api.delete(`/checklists/${id}`);
      checklists = checklists.filter(c => c.id !== id);
    } catch (e: any) { alert(e.message); }
    finally { deletingId = null; }
  }

  // Per-item chat state
  let itemChats: Record<string, {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    input: string;
    loading: boolean;
  }> = {};

  function ensureItemChat(itemId: string) {
    if (!itemChats[itemId]) {
      itemChats[itemId] = { messages: [], input: '', loading: false };
      itemChats = itemChats;
    }
  }

  async function sendItemMessage(item: any, checklist: any) {
    ensureItemChat(item.id);
    const chat = itemChats[item.id];
    const userMsg = chat.input.trim();
    if (!userMsg || chat.loading) return;

    chat.messages = [...chat.messages, { role: 'user', content: userMsg }];
    chat.input = '';
    chat.loading = true;
    itemChats = itemChats;

    try {
      const contextMsg = {
        role: 'user',
        content: `I'm working on a checklist "${checklist.name}". ` +
          `The current item is: "${item.title}". ` +
          (item.description ? `Description: "${item.description}". ` : '') +
          `Help me with this specific task.`
      };
      const history = [contextMsg, ...chat.messages.slice(0, -1)];

      const res = await api.post<{ message: string }>('/agent/chat', {
        message: userMsg,
        projectId,
        history: history.slice(-10),
      });

      chat.messages = [...chat.messages, { role: 'assistant', content: res.message }];
    } catch (e: any) {
      chat.messages = [...chat.messages, { role: 'assistant', content: `Error: ${e.message}` }];
    } finally {
      chat.loading = false;
      itemChats = itemChats;
      // Persist chat messages to DB
      saveChatMessages(item.id);
    }
  }

  async function saveChatMessages(itemId: string) {
    const chat = itemChats[itemId];
    if (!chat) return;
    try {
      await api.put(`/checklists/items/${itemId}`, {
        chatMessages: chat.messages,
      });
    } catch {
      // Silent fail — chat is still available in memory
    }
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
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
      {$_('checklists.generateWithAI')}
    </button>
  </div>

  {#if loading}
    <div class="space-y-4">{#each Array(2) as _}<div class="bg-white rounded-xl border border-gray-200 p-6 h-48 animate-pulse"></div>{/each}</div>
  {:else if checklists.length === 0}
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mb-4 mx-auto">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
      </div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('checklists.empty')}</h2>
      <p class="text-gray-500 mb-6 max-w-sm">{$_('checklists.emptyDesc')}</p>
      <button on:click={() => showModal = true} class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
        {$_('checklists.generateWithAI')}
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
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-gray-900 text-lg">{checklist.name}</h3>
              {#if checklist.description}<p class="text-sm text-gray-500 mt-0.5">{checklist.description}</p>{/if}
            </div>
            <div class="flex items-start gap-3 flex-shrink-0 ml-4">
              <div class="text-right">
                <div class="text-xl font-bold text-primary-600">{progress}%</div>
                <div class="text-xs text-gray-400">{completed}/{total} done</div>
              </div>
              {#if deletingId === checklist.id}
                <div class="flex items-center gap-1">
                  <button on:click={() => deleteChecklist(checklist.id)} class="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition" title={$_('common.delete')}>
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  </button>
                  <button on:click={() => deletingId = null} class="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              {:else}
                <button on:click={() => deletingId = checklist.id} class="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition" title={$_('common.delete')}>
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                </button>
              {/if}
            </div>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-1.5 mb-5">
            <div class="bg-primary-600 h-1.5 rounded-full transition-all duration-500" style="width: {progress}%"></div>
          </div>
          <ul class="space-y-1">
            {#each items as item}
              <li class="rounded-lg transition-colors {expandedItems.has(item.id) ? 'bg-gray-50' : 'hover:bg-gray-50/50'}">
                <div class="flex items-center gap-3 py-2 px-2">
                  <button
                    on:click|stopPropagation={() => toggleItem(checklist.id, item.id, !item.isCompleted)}
                    class="w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all {item.isCompleted ? 'bg-primary-600 border-primary-600' : 'border-gray-300 hover:border-primary-400'}"
                  >
                    {#if item.isCompleted}
                      <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                    {/if}
                  </button>
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="flex-1 min-w-0 flex items-center gap-2 cursor-pointer select-none" on:click={() => toggleExpand(item.id)}>
                    <span class="text-sm {item.isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}">{item.title}</span>
                    <svg class="w-4 h-4 flex-shrink-0 text-gray-400 transition-transform duration-200 {expandedItems.has(item.id) ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                  <div class="w-2 h-2 rounded-full flex-shrink-0 {priorityDot[item.priority] || 'bg-gray-300'}" title={item.priority}></div>
                </div>
                {#if expandedItems.has(item.id)}
                  <div transition:slide={{ duration: 200 }} class="px-2 pb-3 pl-12">
                    {#if item.description}
                      <p class="text-sm text-gray-500 border-l-2 border-primary-200 pl-3 mb-3">{item.description}</p>
                    {/if}

                    {#if itemChats[item.id].messages.length > 0}
                      <div class="space-y-2 mb-3 max-h-60 overflow-y-auto">
                        {#each itemChats[item.id].messages as msg}
                          <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
                            {#if msg.role === 'assistant'}
                              <div class="max-w-[80%] px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 prose prose-sm prose-gray max-w-none [&>p]:m-0 [&>ul]:m-0 [&>ol]:m-0 [&>p+p]:mt-1.5">
                                {@html renderMarkdown(msg.content)}
                              </div>
                            {:else}
                              <div class="max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap bg-primary-100 text-primary-800">
                                {msg.content}
                              </div>
                            {/if}
                          </div>
                        {/each}
                        {#if itemChats[item.id].loading}
                          <div class="flex justify-start">
                            <div class="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-400 animate-pulse">...</div>
                          </div>
                        {/if}
                      </div>
                    {/if}

                    <div class="flex gap-2">
                      <input
                        type="text"
                        bind:value={itemChats[item.id].input}
                        on:keydown={(e) => e.key === 'Enter' && !e.shiftKey && sendItemMessage(item, checklist)}
                        placeholder={$_('checklists.askAI')}
                        class="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"
                      />
                      <button
                        on:click={() => sendItemMessage(item, checklist)}
                        disabled={!itemChats[item.id].input.trim() || itemChats[item.id].loading}
                        class="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50 transition flex-shrink-0"
                      >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                        </svg>
                      </button>
                    </div>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <h2 class="text-lg font-semibold mb-4">{$_('checklists.generateWithAI')}</h2>
      <div class="mb-6">
        <label for="checklist-type" class="block text-sm font-medium text-gray-700 mb-1">{$_('checklists.type')}</label>
        <select id="checklist-type" bind:value={form.type} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
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
        <button on:click={generateWithAI} disabled={creating} class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition text-sm flex items-center justify-center gap-2">
          {#if creating}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
          {/if}
          {creating ? $_('common.loading') : $_('checklists.generateWithAI')}
        </button>
        <button on:click={() => showModal = false} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm">{$_('common.cancel')}</button>
      </div>
    </div>
  </div>
{/if}
