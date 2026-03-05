<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { api } from '$lib/api/client';
  import SectionHint from '$lib/components/SectionHint.svelte';
  import { marked } from 'marked';

  // Configure marked for inline rendering (no wrapping <p> tags for short content)
  marked.setOptions({ breaks: true, gfm: true });

  function renderMarkdown(text: string): string {
    return marked.parse(text, { async: false }) as string;
  }

  let checklists: any[] = [];
  let loading = true;
  let showAIModal = false;
  let creating = false;
  let expandedItems = new Set<string>();
  $: projectId = $page.params['id'];
  let aiForm = { type: 'LAUNCH' };

  // ── MD Import state ──
  interface ParsedChecklist {
    name: string;
    description: string;
    items: Array<{
      title: string;
      description: string;
      order: number;
      priority: string;
      isCompleted: boolean;
    }>;
  }

  let showImportModal = false;
  let importParsed: ParsedChecklist | null = null;
  let importError = '';
  let importing = false;

  // ── Manual Create state ──
  let showCreateModal = false;
  let createForm = {
    name: '',
    type: 'CUSTOM',
    description: '',
    items: [] as Array<{ title: string; description: string; priority: string }>,
  };
  let creatingManual = false;

  // ── Edit Checklist state ──
  let editingChecklist: any = null;
  let editChecklistForm = { name: '', description: '' };

  // ── Edit Item state ──
  let editingItem: any = null;
  let editItemForm = { title: '', description: '', priority: 'MEDIUM' };

  // ── Delete item state ──
  let deletingItemId: string | null = null;

  // ── Add item inline state ──
  let addingItemToId: string | null = null;
  let newItemForm = { title: '', description: '', priority: 'MEDIUM' };

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

  // ── AI Generation ──
  async function generateWithAI() {
    creating = true;
    try {
      const run = await api.post<{ id: string; status: string }>('/agent/run', { projectId, agentType: 'CHECKLIST', input: { type: aiForm.type, language: $locale } });

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
      showAIModal = false;
    } catch (e: any) { alert(e.message); }
    finally { creating = false; }
  }

  // ── Toggle item completion ──
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

  // ── MD Parsing ──
  function parseMarkdownChecklist(md: string): ParsedChecklist {
    const lines = md.split('\n');
    let name = '';
    let description = '';
    const items: ParsedChecklist['items'] = [];
    let currentItem: ParsedChecklist['items'][0] | null = null;
    let inDescription = false;
    let order = 0;

    for (const line of lines) {
      const h1Match = line.match(/^#\s+(.+)/);
      if (h1Match && !name) {
        name = h1Match[1].trim();
        inDescription = true;
        continue;
      }

      if (line.match(/^##\s+/)) {
        inDescription = false;
        if (currentItem) currentItem.description = currentItem.description.trim();
        currentItem = null;
        continue;
      }

      const taskMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)/);
      if (taskMatch) {
        inDescription = false;
        if (currentItem) currentItem.description = currentItem.description.trim();
        order++;
        let title = taskMatch[2].trim();
        let priority = 'MEDIUM';

        const priorityMatch = title.match(/\[(HIGH|CRITICAL|LOW|MEDIUM)\]\s*$/i);
        if (priorityMatch) {
          priority = priorityMatch[1].toUpperCase();
          title = title.replace(/\[(HIGH|CRITICAL|LOW|MEDIUM)\]\s*$/i, '').trim();
        }

        currentItem = {
          title,
          description: '',
          order,
          priority,
          isCompleted: taskMatch[1] !== ' ',
        };
        items.push(currentItem);
        continue;
      }

      if (currentItem && line.match(/^\s+\S/)) {
        currentItem.description += (currentItem.description ? '\n' : '') + line.trim();
        continue;
      }

      if (inDescription && line.trim()) {
        description += (description ? '\n' : '') + line.trim();
      }
    }

    if (currentItem) currentItem.description = currentItem.description.trim();

    return { name: name || 'Imported Checklist', description, items };
  }

  function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importError = '';

    if (!file.name.endsWith('.md')) {
      importError = $_('checklists.importErrorFormat');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        importParsed = parseMarkdownChecklist(text);
        if (importParsed.items.length === 0) {
          importError = $_('checklists.importErrorNoItems');
          importParsed = null;
        }
      } catch {
        importError = $_('checklists.importErrorParse');
        importParsed = null;
      }
    };
    reader.readAsText(file);
  }

  async function importChecklist() {
    if (!importParsed) return;
    importing = true;
    try {
      await api.post('/checklists', {
        projectId,
        name: importParsed.name,
        type: 'CUSTOM',
        description: importParsed.description,
        items: importParsed.items,
      });
      checklists = await api.get<any[]>('/checklists', { projectId });
      initChatsFromDB();
      showImportModal = false;
      importParsed = null;
    } catch (e: any) {
      importError = e.message;
    } finally {
      importing = false;
    }
  }

  // ── Manual Create ──
  function addCreateItem() {
    createForm.items = [...createForm.items, { title: '', description: '', priority: 'MEDIUM' }];
  }

  function removeCreateItem(index: number) {
    createForm.items = createForm.items.filter((_, i) => i !== index);
  }

  async function createManualChecklist() {
    if (!createForm.name.trim()) return;
    creatingManual = true;
    try {
      await api.post('/checklists', {
        projectId,
        name: createForm.name,
        type: createForm.type,
        description: createForm.description,
        items: createForm.items
          .filter(i => i.title.trim())
          .map((i, idx) => ({ ...i, order: idx + 1 })),
      });
      checklists = await api.get<any[]>('/checklists', { projectId });
      initChatsFromDB();
      showCreateModal = false;
      createForm = { name: '', type: 'CUSTOM', description: '', items: [] };
    } catch (e: any) {
      alert(e.message);
    } finally {
      creatingManual = false;
    }
  }

  // ── Edit Checklist ──
  function openEditChecklist(checklist: any) {
    editingChecklist = checklist;
    editChecklistForm = { name: checklist.name, description: checklist.description || '' };
  }

  async function saveEditChecklist() {
    if (!editingChecklist) return;
    try {
      const updated = await api.put<any>(`/checklists/${editingChecklist.id}`, editChecklistForm);
      checklists = checklists.map(c => c.id === updated.id ? { ...c, name: updated.name, description: updated.description } : c);
      editingChecklist = null;
    } catch (e: any) {
      alert(e.message);
    }
  }

  // ── Edit Item ──
  function openEditItem(item: any) {
    editingItem = item;
    editItemForm = {
      title: item.title,
      description: item.description || '',
      priority: item.priority || 'MEDIUM',
    };
  }

  async function saveEditItem() {
    if (!editingItem) return;
    try {
      const updated = await api.put<any>(`/checklists/items/${editingItem.id}`, editItemForm);
      checklists = checklists.map(c => ({
        ...c,
        items: (c.items || []).map((i: any) => i.id === updated.id ? { ...i, ...updated } : i),
      }));
      editingItem = null;
    } catch (e: any) {
      alert(e.message);
    }
  }

  // ── Delete Item ──
  async function deleteItem(checklistId: string, itemId: string) {
    try {
      await api.delete(`/checklists/items/${itemId}`);
      checklists = checklists.map(c =>
        c.id === checklistId
          ? { ...c, items: (c.items || []).filter((i: any) => i.id !== itemId) }
          : c
      );
    } catch (e: any) {
      alert(e.message);
    } finally {
      deletingItemId = null;
    }
  }

  // ── Add Item Inline ──
  async function addItemToChecklist(checklistId: string) {
    if (!newItemForm.title.trim()) return;
    try {
      const item = await api.post<any>(`/checklists/${checklistId}/items`, newItemForm);
      checklists = checklists.map(c =>
        c.id === checklistId
          ? { ...c, items: [...(c.items || []), item] }
          : c
      );
      newItemForm = { title: '', description: '', priority: 'MEDIUM' };
      addingItemToId = null;
    } catch (e: any) {
      alert(e.message);
    }
  }

  // ── Reorder ──
  async function moveItem(checklistId: string, items: any[], index: number, direction: 'up' | 'down') {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= items.length) return;

    const reordered = [...items];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    const itemIds = reordered.map((i: any) => i.id);

    // Optimistic update
    checklists = checklists.map(c =>
      c.id === checklistId ? { ...c, items: reordered } : c
    );

    try {
      await api.put(`/checklists/${checklistId}/reorder`, { itemIds });
    } catch (e: any) {
      checklists = checklists.map(c =>
        c.id === checklistId ? { ...c, items } : c
      );
      alert(e.message);
    }
  }

  // ── Per-item chat state ──
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

  const typeOptions = ['LAUNCH', 'WEEKLY', 'CAMPAIGN_PREP', 'SEO', 'SOCIAL_MEDIA', 'EMAIL_CAMPAIGN', 'COMPETITIVE_ANALYSIS', 'CUSTOM'] as const;
  const typeLabel: Record<string, string> = {
    LAUNCH: 'checklists.launch',
    WEEKLY: 'checklists.weekly',
    CAMPAIGN_PREP: 'checklists.campaignPrep',
    SEO: 'checklists.seo',
    SOCIAL_MEDIA: 'checklists.socialMedia',
    EMAIL_CAMPAIGN: 'checklists.emailCampaign',
    COMPETITIVE_ANALYSIS: 'checklists.competitiveAnalysis',
    CUSTOM: 'checklists.custom',
  };
</script>

<div class="p-6">
  <SectionHint sectionKey="checklists" titleKey="hints.checklists.title" descKey="hints.checklists.desc" />
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">{$_('checklists.title')}</h1>
    <div class="flex items-center gap-2">
      <button on:click={() => showCreateModal = true} class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        {$_('checklists.createManual')}
      </button>
      <button on:click={() => { showImportModal = true; importParsed = null; importError = ''; }} class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
        {$_('checklists.importFromMD')}
      </button>
      <button on:click={() => showAIModal = true} class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
        {$_('checklists.generateWithAI')}
      </button>
    </div>
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
      <div class="flex gap-3">
        <button on:click={() => showCreateModal = true} class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          {$_('checklists.createManual')}
        </button>
        <button on:click={() => showAIModal = true} class="border border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-medium hover:bg-gray-50 transition flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
          {$_('checklists.generateWithAI')}
        </button>
      </div>
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
              <div class="flex items-center gap-2">
                <h3 class="font-semibold text-gray-900 text-lg">{checklist.name}</h3>
                <button on:click={() => openEditChecklist(checklist)} class="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition" title={$_('checklists.editChecklist')}>
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg>
                </button>
              </div>
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
            {#each items as item, itemIndex}
              <li class="rounded-lg transition-colors {expandedItems.has(item.id) ? 'bg-gray-50' : 'hover:bg-gray-50/50'}">
                <div class="flex items-center gap-3 py-2 px-2 group">
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
                  <!-- Item action buttons (visible on hover) -->
                  <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {#if itemIndex > 0}
                      <button on:click|stopPropagation={() => moveItem(checklist.id, items, itemIndex, 'up')} class="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title={$_('checklists.moveUp')}>
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                      </button>
                    {/if}
                    {#if itemIndex < items.length - 1}
                      <button on:click|stopPropagation={() => moveItem(checklist.id, items, itemIndex, 'down')} class="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title={$_('checklists.moveDown')}>
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                      </button>
                    {/if}
                    <button on:click|stopPropagation={() => openEditItem(item)} class="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50" title={$_('checklists.editItem')}>
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg>
                    </button>
                    {#if deletingItemId === item.id}
                      <button on:click|stopPropagation={() => deleteItem(checklist.id, item.id)} class="p-1 rounded bg-red-50 text-red-600 hover:bg-red-100">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                      </button>
                      <button on:click|stopPropagation={() => deletingItemId = null} class="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                      </button>
                    {:else}
                      <button on:click|stopPropagation={() => deletingItemId = item.id} class="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50" title={$_('checklists.deleteItem')}>
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                      </button>
                    {/if}
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
          <!-- Add Item inline -->
          {#if addingItemToId === checklist.id}
            <div transition:slide={{ duration: 150 }} class="mt-3 p-3 border border-dashed border-gray-300 rounded-lg">
              <div class="flex gap-2 mb-2">
                <input type="text" bind:value={newItemForm.title} placeholder={$_('checklists.itemTitlePlaceholder')} class="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-400" on:keydown={(e) => e.key === 'Enter' && addItemToChecklist(checklist.id)} />
                <select bind:value={newItemForm.priority} class="text-sm px-2 py-2 border border-gray-200 rounded-lg">
                  <option value="LOW">{$_('checklists.low')}</option>
                  <option value="MEDIUM">{$_('checklists.medium')}</option>
                  <option value="HIGH">{$_('checklists.high')}</option>
                  <option value="CRITICAL">{$_('checklists.critical')}</option>
                </select>
              </div>
              <textarea bind:value={newItemForm.description} placeholder={$_('checklists.descriptionLabel')} rows="2" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-400 mb-2"></textarea>
              <div class="flex gap-2 justify-end">
                <button on:click={() => { addingItemToId = null; newItemForm = { title: '', description: '', priority: 'MEDIUM' }; }} class="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">{$_('common.cancel')}</button>
                <button on:click={() => addItemToChecklist(checklist.id)} disabled={!newItemForm.title.trim()} class="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition">{$_('checklists.addItemToList')}</button>
              </div>
            </div>
          {:else}
            <button on:click={() => { addingItemToId = checklist.id; newItemForm = { title: '', description: '', priority: 'MEDIUM' }; }} class="mt-3 w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:text-primary-600 hover:border-primary-400 transition flex items-center justify-center gap-1.5">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              {$_('checklists.addItemToList')}
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- ═══ AI Generation Modal ═══ -->
{#if showAIModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showAIModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <h2 class="text-lg font-semibold mb-4">{$_('checklists.generateWithAI')}</h2>
      <div class="mb-6">
        <label for="checklist-type" class="block text-sm font-medium text-gray-700 mb-1">{$_('checklists.type')}</label>
        <select id="checklist-type" bind:value={aiForm.type} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          {#each typeOptions.filter(t => t !== 'CUSTOM') as t}
            <option value={t}>{$_(typeLabel[t])}</option>
          {/each}
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
        <button on:click={() => showAIModal = false} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm">{$_('common.cancel')}</button>
      </div>
    </div>
  </div>
{/if}

<!-- ═══ Import from MD Modal ═══ -->
{#if showImportModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showImportModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
      <h2 class="text-lg font-semibold mb-2">{$_('checklists.importTitle')}</h2>
      <p class="text-sm text-gray-500 mb-4">{$_('checklists.importDesc')}</p>

      <label class="block mb-4">
        <span class="sr-only">{$_('checklists.importChooseFile')}</span>
        <input type="file" accept=".md" on:change={handleFileUpload} class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer" />
      </label>

      {#if importError}
        <div class="text-sm text-red-600 mb-4 bg-red-50 p-3 rounded-lg">{importError}</div>
      {/if}

      {#if importParsed}
        <div class="mb-4 border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
          <h3 class="font-medium text-gray-900 text-sm mb-1">{importParsed.name}</h3>
          {#if importParsed.description}
            <p class="text-xs text-gray-500 mb-2">{importParsed.description}</p>
          {/if}
          <div class="text-xs text-primary-600 font-medium mb-2">{$_('checklists.importItems', { values: { count: importParsed.items.length } })}</div>
          <ul class="space-y-1">
            {#each importParsed.items as item}
              <li class="flex items-center gap-2 text-sm">
                <div class="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center {item.isCompleted ? 'bg-primary-600 border-primary-600' : 'border-gray-300'}">
                  {#if item.isCompleted}
                    <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                  {/if}
                </div>
                <span class="text-gray-700 {item.isCompleted ? 'line-through text-gray-400' : ''}">{item.title}</span>
                <div class="w-1.5 h-1.5 rounded-full flex-shrink-0 {priorityDot[item.priority] || 'bg-gray-300'}"></div>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="flex gap-3">
        {#if importParsed}
          <button on:click={importChecklist} disabled={importing} class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition text-sm flex items-center justify-center gap-2">
            {#if importing}
              <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            {/if}
            {$_('checklists.importConfirm')}
          </button>
        {/if}
        <button on:click={() => showImportModal = false} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm">{$_('common.cancel')}</button>
      </div>
    </div>
  </div>
{/if}

<!-- ═══ Manual Create Modal ═══ -->
{#if showCreateModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showCreateModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
      <h2 class="text-lg font-semibold mb-4">{$_('checklists.manualCreateTitle')}</h2>

      <div class="space-y-4 mb-6">
        <div>
          <label for="create-name" class="block text-sm font-medium text-gray-700 mb-1">{$_('checklists.checklistName')}</label>
          <input id="create-name" type="text" bind:value={createForm.name} placeholder={$_('checklists.checklistNamePlaceholder')} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400" />
        </div>
        <div>
          <label for="create-type" class="block text-sm font-medium text-gray-700 mb-1">{$_('checklists.type')}</label>
          <select id="create-type" bind:value={createForm.type} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            {#each typeOptions as t}
              <option value={t}>{$_(typeLabel[t])}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="create-desc" class="block text-sm font-medium text-gray-700 mb-1">{$_('checklists.checklistDescription')}</label>
          <textarea id="create-desc" bind:value={createForm.description} placeholder={$_('checklists.checklistDescriptionPlaceholder')} rows="2" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"></textarea>
        </div>

        <!-- Items builder -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">{$_('checklists.title')}</label>
          {#if createForm.items.length === 0}
            <p class="text-sm text-gray-400 mb-2">{$_('checklists.noItemsYet')}</p>
          {:else}
            <div class="space-y-2 mb-2">
              {#each createForm.items as item, i}
                <div class="flex gap-2 items-start p-2 bg-gray-50 rounded-lg">
                  <div class="flex-1 space-y-1.5">
                    <input type="text" bind:value={item.title} placeholder={$_('checklists.itemTitlePlaceholder')} class="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-400" />
                    <div class="flex gap-2">
                      <input type="text" bind:value={item.description} placeholder={$_('checklists.descriptionLabel')} class="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-400" />
                      <select bind:value={item.priority} class="text-xs px-2 py-1.5 border border-gray-200 rounded">
                        <option value="LOW">{$_('checklists.low')}</option>
                        <option value="MEDIUM">{$_('checklists.medium')}</option>
                        <option value="HIGH">{$_('checklists.high')}</option>
                        <option value="CRITICAL">{$_('checklists.critical')}</option>
                      </select>
                    </div>
                  </div>
                  <button on:click={() => removeCreateItem(i)} class="p-1 text-gray-400 hover:text-red-500 mt-1">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              {/each}
            </div>
          {/if}
          <button on:click={addCreateItem} class="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            {$_('checklists.addAnotherItem')}
          </button>
        </div>
      </div>

      <div class="flex gap-3">
        <button on:click={createManualChecklist} disabled={!createForm.name.trim() || creatingManual} class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition text-sm">
          {creatingManual ? $_('common.loading') : $_('checklists.createManual')}
        </button>
        <button on:click={() => showCreateModal = false} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm">{$_('common.cancel')}</button>
      </div>
    </div>
  </div>
{/if}

<!-- ═══ Edit Checklist Modal ═══ -->
{#if editingChecklist}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => editingChecklist = null}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <h2 class="text-lg font-semibold mb-4">{$_('checklists.editChecklist')}</h2>
      <div class="space-y-4 mb-6">
        <div>
          <label for="edit-name" class="block text-sm font-medium text-gray-700 mb-1">{$_('checklists.checklistName')}</label>
          <input id="edit-name" type="text" bind:value={editChecklistForm.name} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400" />
        </div>
        <div>
          <label for="edit-desc" class="block text-sm font-medium text-gray-700 mb-1">{$_('checklists.descriptionLabel')}</label>
          <textarea id="edit-desc" bind:value={editChecklistForm.description} rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"></textarea>
        </div>
      </div>
      <div class="flex gap-3">
        <button on:click={saveEditChecklist} disabled={!editChecklistForm.name.trim()} class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition text-sm">{$_('checklists.save')}</button>
        <button on:click={() => editingChecklist = null} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm">{$_('common.cancel')}</button>
      </div>
    </div>
  </div>
{/if}

<!-- ═══ Edit Item Modal ═══ -->
{#if editingItem}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => editingItem = null}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <h2 class="text-lg font-semibold mb-4">{$_('checklists.editItem')}</h2>
      <div class="space-y-4 mb-6">
        <div>
          <label for="edit-item-title" class="block text-sm font-medium text-gray-700 mb-1">{$_('checklists.itemTitle')}</label>
          <input id="edit-item-title" type="text" bind:value={editItemForm.title} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400" />
        </div>
        <div>
          <label for="edit-item-desc" class="block text-sm font-medium text-gray-700 mb-1">{$_('checklists.descriptionLabel')}</label>
          <textarea id="edit-item-desc" bind:value={editItemForm.description} rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"></textarea>
        </div>
        <div>
          <label for="edit-item-priority" class="block text-sm font-medium text-gray-700 mb-1">{$_('checklists.priority')}</label>
          <select id="edit-item-priority" bind:value={editItemForm.priority} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="LOW">{$_('checklists.low')}</option>
            <option value="MEDIUM">{$_('checklists.medium')}</option>
            <option value="HIGH">{$_('checklists.high')}</option>
            <option value="CRITICAL">{$_('checklists.critical')}</option>
          </select>
        </div>
      </div>
      <div class="flex gap-3">
        <button on:click={saveEditItem} disabled={!editItemForm.title.trim()} class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition text-sm">{$_('checklists.save')}</button>
        <button on:click={() => editingItem = null} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm">{$_('common.cancel')}</button>
      </div>
    </div>
  </div>
{/if}
