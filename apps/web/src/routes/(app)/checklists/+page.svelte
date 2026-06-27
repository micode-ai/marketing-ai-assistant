<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { organizationIdStore, currentProjectStore, projectsStore } from '$lib/stores/projects';
  import { contextStore } from '$lib/stores/context';
  import { currentUser } from '$lib/stores/auth';
  import { api } from '$lib/api/client';
  import { goto } from '$app/navigation';

  let items: any[] = [];
  let loading = true;

  $: ctx = $contextStore;
  $: memberships = ($currentUser as any)?.memberships || [];
  $: currentOrg = memberships.find((m: any) => m.organization?.id === $organizationIdStore)?.organization;
  $: projects = $projectsStore || [];

  const checklistTypes: { value: string; labelKey: string }[] = [
    { value: 'LAUNCH', labelKey: 'checklists.launch' },
    { value: 'WEEKLY', labelKey: 'checklists.weekly' },
    { value: 'CAMPAIGN_PREP', labelKey: 'checklists.campaignPrep' },
    { value: 'SEO', labelKey: 'checklists.seo' },
    { value: 'SOCIAL_MEDIA', labelKey: 'checklists.socialMedia' },
    { value: 'EMAIL_CAMPAIGN', labelKey: 'checklists.emailCampaign' },
    { value: 'COMPETITIVE_ANALYSIS', labelKey: 'checklists.competitiveAnalysis' },
    { value: 'CUSTOM', labelKey: 'checklists.custom' },
  ];

  // ── Create modal ──
  let showCreateModal = false;
  let creating = false;
  let createForm = {
    name: '',
    type: 'CUSTOM' as string,
    description: '',
    projectId: '' as string,
  };

  // ── AI Generate modal ──
  let showAIModal = false;
  let aiGenerating = false;
  let aiForm = { type: 'LAUNCH', projectId: '' as string };
  let aiStatus = '';

  // ── MD Import modal ──
  let showImportModal = false;
  let importParsed: { name: string; description: string; items: any[] } | null = null;
  let importError = '';
  let importing = false;
  let importProjectId = '';

  async function loadData() {
    if (!ctx.organizationId) return;
    loading = true;
    try {
      const params: Record<string, string> = ctx.type === 'project' && ctx.projectId
        ? { projectId: ctx.projectId }
        : { organizationId: ctx.organizationId, aggregated: 'true' };
      const res = await api.get<any[]>('/checklists', params);
      items = res;
    } catch (e) {
      console.error('Failed to load checklists:', e);
      items = [];
    } finally {
      loading = false;
    }
  }

  // ── Manual Create ──
  function openCreateModal() {
    createForm = { name: '', type: 'CUSTOM', description: '', projectId: $currentProjectStore?.id || '' };
    showCreateModal = true;
  }

  async function createChecklist() {
    if (creating || !createForm.name.trim()) return;
    creating = true;
    try {
      const body: any = { name: createForm.name.trim(), type: createForm.type, description: createForm.description || undefined };
      if (createForm.projectId) { body.projectId = createForm.projectId; body.scope = 'PROJECT'; }
      else { body.organizationId = ctx.organizationId; body.scope = 'ORGANIZATION'; }
      const created = await api.post<any>('/checklists', body);
      showCreateModal = false;
      if (created.projectId) goto(`/projects/${created.projectId}/checklists`);
      else await loadData();
    } catch (e) { console.error('Failed to create checklist:', e); }
    finally { creating = false; }
  }

  // ── AI Generate ──
  function openAIModal() {
    aiForm = { type: 'LAUNCH', projectId: projects[0]?.id || '' };
    aiStatus = '';
    showAIModal = true;
  }

  async function generateWithAI() {
    if (aiGenerating || !aiForm.projectId) return;
    aiGenerating = true;
    aiStatus = $_('common.loading');
    try {
      const run = await api.post<{ id: string; status: string }>('/agent/run', {
        projectId: aiForm.projectId,
        agentType: 'CHECKLIST',
        input: { type: aiForm.type, language: $locale },
      });

      let attempts = 0;
      while (attempts < 60) {
        await new Promise(r => setTimeout(r, 2000));
        const updated = await api.get<{ status: string; error?: string }>(`/agent/runs/${run.id}`);
        aiStatus = `${$_('common.loading')} (${attempts + 1}s)`;
        if (updated.status === 'COMPLETED') break;
        if (updated.status === 'FAILED') throw new Error(updated.error || 'Agent run failed');
        attempts++;
      }
      if (attempts >= 60) throw new Error('Timeout');

      showAIModal = false;
      await loadData();
    } catch (e: any) {
      aiStatus = `${$_('common.error')}: ${e.message}`;
    } finally {
      aiGenerating = false;
    }
  }

  // ── MD Import ──
  function openImportModal() {
    importParsed = null;
    importError = '';
    importProjectId = '';
    showImportModal = true;
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

  function parseMarkdownChecklist(md: string): { name: string; description: string; items: any[] } {
    const lines = md.split('\n');
    let name = '';
    let description = '';
    const items: any[] = [];
    let currentItem: any = null;
    let inDescription = false;
    let order = 0;
    const sectionStack: string[] = [];

    for (const line of lines) {
      const h1Match = line.match(/^#(?!#)\s+(.+)/);
      if (h1Match && !name) { name = h1Match[1].trim(); inDescription = true; continue; }

      const headingMatch = line.match(/^(#{2,})\s+(.+)/);
      if (headingMatch) {
        inDescription = false;
        if (currentItem) currentItem.description = currentItem.description.trim();
        currentItem = null;
        const depth = headingMatch[1].length - 2;
        sectionStack.length = depth;
        sectionStack[depth] = headingMatch[2].trim();
        continue;
      }

      const taskMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)/);
      if (taskMatch) {
        inDescription = false;
        if (currentItem) currentItem.description = currentItem.description.trim();
        order++;
        let title = taskMatch[2].trim();
        let priority = 'MEDIUM';
        const pm = title.match(/\[(HIGH|CRITICAL|LOW|MEDIUM)\]\s*$/i);
        if (pm) { priority = pm[1].toUpperCase(); title = title.replace(/\[(HIGH|CRITICAL|LOW|MEDIUM)\]\s*$/i, '').trim(); }
        currentItem = { title, description: '', order, priority, isCompleted: taskMatch[1] !== ' ', section: sectionStack.length > 0 ? sectionStack.join(' / ') : undefined };
        items.push(currentItem);
        continue;
      }

      if (currentItem && line.match(/^\s+\S/)) { currentItem.description += (currentItem.description ? '\n' : '') + line.trim(); continue; }
      if (inDescription && line.trim()) { description += (description ? '\n' : '') + line.trim(); }
    }
    if (currentItem) currentItem.description = currentItem.description.trim();
    return { name: name || 'Imported Checklist', description, items };
  }

  async function importChecklist() {
    if (!importParsed) return;
    importing = true;
    try {
      const body: any = { name: importParsed.name, type: 'CUSTOM', description: importParsed.description, items: importParsed.items };
      if (importProjectId) { body.projectId = importProjectId; body.scope = 'PROJECT'; }
      else { body.organizationId = ctx.organizationId; body.scope = 'ORGANIZATION'; }
      await api.post('/checklists', body);
      showImportModal = false;
      importParsed = null;
      await loadData();
    } catch (e: any) { importError = e.message; }
    finally { importing = false; }
  }

  $: $contextStore, loadData();
</script>

<div class="p-4 sm:p-6">
  <div class="flex items-center gap-1.5 text-sm text-ink-muted mb-1">
    <span>{currentOrg?.name || $_('header.orgContext')}</span>
    {#if $currentProjectStore}
      <span class="text-ink-subtle">›</span>
      <span class="text-brand">{$currentProjectStore.name}</span>
    {/if}
    <span class="text-ink-subtle">›</span>
    <span class="text-ink">{$_('nav.orgChecklists')}</span>
  </div>

  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-ink">{$_('nav.orgChecklists')}</h1>
    <div class="flex items-center gap-2">
      <button on:click={openImportModal} class="inline-flex items-center gap-2 px-3 py-2 bg-surface border border-border text-ink text-sm font-medium rounded-lg hover:bg-surface-2 transition-colors cursor-pointer">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
        {$_('checklists.importFromMD')}
      </button>
      <button on:click={openAIModal} class="inline-flex items-center gap-2 px-3 py-2 bg-surface border border-border text-ink text-sm font-medium rounded-lg hover:bg-surface-2 transition-colors cursor-pointer">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
        {$_('checklists.generateWithAI')}
      </button>
      <button on:click={openCreateModal} class="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:brightness-110 transition-colors cursor-pointer">
        + {$_('checklists.createManual')}
      </button>
    </div>
  </div>

  {#if loading}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
    </div>
  {:else if items.length === 0}
    <div class="text-center py-12 text-ink-muted">
      <p>{$_('checklists.empty')}</p>
      <p class="text-sm mt-1">{$_('checklists.emptyDesc')}</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each items as item}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          on:click={() => { if (item.projectId) goto(`/projects/${item.projectId}/checklists`); }}
          class="block bg-surface rounded-lg border border-border p-4 hover:border-brand/40 hover:shadow-sm transition-all cursor-pointer">
          <div class="flex items-center justify-between">
            <div class="min-w-0 flex-1">
              <h3 class="font-medium text-ink">{item.name}</h3>
              <p class="text-sm text-ink-muted truncate">
                {$_(checklistTypes.find(t => t.value === item.type)?.labelKey || 'checklists.custom')}
                {item.description ? ' · ' + item.description.substring(0, 60) : ''}
              </p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0 ml-3">
              {#if item._count?.items || item.items?.length}
                {@const total = item._count?.items || item.items?.length || 0}
                {@const done = item.items?.filter((i) => i.isCompleted).length || 0}
                <div class="flex items-center gap-1.5">
                  <div class="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div class="h-full bg-green-500 rounded-full" style="width: {total > 0 ? Math.round(done / total * 100) : 0}%"></div>
                  </div>
                  <span class="text-xs text-ink-subtle whitespace-nowrap">{done}/{total}</span>
                </div>
              {/if}
              <span class="text-xs px-2 py-1 rounded-full whitespace-nowrap {item.scope === 'ORGANIZATION' ? 'bg-purple-500/20 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-blue-500/20 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}">
                {item.scope === 'ORGANIZATION' ? (currentOrg?.name || 'Org') : (item.project?.name || $_('org.scopeProject'))}
              </span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Manual Create Modal -->
{#if showCreateModal}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showCreateModal = false}>
  <div class="bg-surface rounded-xl w-full max-w-md p-6 shadow-xl">
    <h3 class="text-lg font-semibold text-ink mb-4">{$_('checklists.createManual')}</h3>
    <div class="mb-4">
      <label class="block text-sm text-ink-muted mb-1">{$_('checklists.scope')}</label>
      <select bind:value={createForm.projectId} class="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-ink">
        <option value="">{currentOrg?.name || $_('header.orgContext')}</option>
        {#each projects as proj}<option value={proj.id}>{proj.name}</option>{/each}
      </select>
    </div>
    <div class="mb-4">
      <label class="block text-sm text-ink-muted mb-1">{$_('checklists.name')}</label>
      <input type="text" bind:value={createForm.name} class="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-ink" />
    </div>
    <div class="mb-4">
      <label class="block text-sm text-ink-muted mb-1">{$_('checklists.type')}</label>
      <select bind:value={createForm.type} class="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-ink">
        {#each checklistTypes as t}<option value={t.value}>{$_(t.labelKey)}</option>{/each}
      </select>
    </div>
    <div class="mb-4">
      <label class="block text-sm text-ink-muted mb-1">{$_('checklists.description')}</label>
      <textarea bind:value={createForm.description} rows="2" class="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-ink"></textarea>
    </div>
    <div class="flex gap-3 justify-end">
      <button on:click={() => showCreateModal = false} class="px-4 py-2 text-ink-muted hover:text-ink cursor-pointer">{$_('common.cancel')}</button>
      <button on:click={createChecklist} disabled={creating || !createForm.name.trim()} class="px-4 py-2 bg-brand text-white rounded-lg hover:brightness-110 disabled:opacity-50 cursor-pointer">
        {creating ? $_('common.loading') : $_('common.create')}
      </button>
    </div>
  </div>
</div>
{/if}

<!-- AI Generate Modal -->
{#if showAIModal}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => { if (!aiGenerating) showAIModal = false; }}>
  <div class="bg-surface rounded-xl w-full max-w-md p-6 shadow-xl">
    <h3 class="text-lg font-semibold text-ink mb-4">{$_('checklists.generateWithAI')}</h3>

    <div class="mb-4">
      <label class="block text-sm text-ink-muted mb-1">{$_('checklists.scope')}</label>
      <select bind:value={aiForm.projectId} disabled={aiGenerating} class="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-ink disabled:opacity-50">
        {#each projects as proj}<option value={proj.id}>{proj.name}</option>{/each}
      </select>
      {#if projects.length === 0}
        <p class="text-sm text-amber-600 dark:text-amber-400 mt-1">{$_('common.noData')}</p>
      {/if}
    </div>

    <div class="mb-4">
      <label class="block text-sm text-ink-muted mb-1">{$_('checklists.type')}</label>
      <select bind:value={aiForm.type} disabled={aiGenerating} class="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-ink disabled:opacity-50">
        {#each checklistTypes as t}<option value={t.value}>{$_(t.labelKey)}</option>{/each}
      </select>
    </div>

    {#if aiStatus}
      <div class="mb-4 p-3 rounded-lg {aiStatus.startsWith($_('common.error')) ? 'bg-red-500/12 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-brand-subtle/10 text-brand'} text-sm">
        {#if aiGenerating}
          <div class="flex items-center gap-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
            {aiStatus}
          </div>
        {:else}
          {aiStatus}
        {/if}
      </div>
    {/if}

    <div class="flex gap-3 justify-end">
      <button on:click={() => showAIModal = false} disabled={aiGenerating} class="px-4 py-2 text-ink-muted hover:text-ink cursor-pointer disabled:opacity-50">{$_('common.cancel')}</button>
      <button on:click={generateWithAI} disabled={aiGenerating || !aiForm.projectId} class="px-4 py-2 bg-brand text-white rounded-lg hover:brightness-110 disabled:opacity-50 cursor-pointer">
        {aiGenerating ? $_('common.loading') : $_('checklists.generateWithAI')}
      </button>
    </div>
  </div>
</div>
{/if}

<!-- MD Import Modal -->
{#if showImportModal}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showImportModal = false}>
  <div class="bg-surface rounded-xl w-full max-w-md p-6 shadow-xl">
    <h3 class="text-lg font-semibold text-ink mb-2">{$_('checklists.importTitle')}</h3>
    <p class="text-sm text-ink-muted mb-4">{$_('checklists.importDesc')}</p>

    <div class="mb-4">
      <label class="block text-sm text-ink-muted mb-1">{$_('checklists.scope')}</label>
      <select bind:value={importProjectId} class="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-ink">
        <option value="">{currentOrg?.name || $_('header.orgContext')}</option>
        {#each projects as proj}<option value={proj.id}>{proj.name}</option>{/each}
      </select>
    </div>

    <div class="mb-4">
      <input type="file" accept=".md" on:change={handleFileUpload} class="block w-full text-sm text-ink-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-subtle/12 file:text-brand hover:file:bg-brand-subtle/12 cursor-pointer" />
    </div>

    {#if importError}
      <div class="mb-4 p-3 rounded-lg bg-red-500/12 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{importError}</div>
    {/if}

    {#if importParsed}
      <div class="mb-4 p-3 rounded-lg bg-surface-2 text-sm">
        <div class="font-medium text-ink">{importParsed.name}</div>
        <div class="text-ink-muted mt-1">{$_('checklists.importItems', { values: { count: importParsed.items.length } })}</div>
      </div>
    {/if}

    <div class="flex gap-3 justify-end">
      <button on:click={() => showImportModal = false} class="px-4 py-2 text-ink-muted hover:text-ink cursor-pointer">{$_('common.cancel')}</button>
      <button on:click={importChecklist} disabled={importing || !importParsed} class="px-4 py-2 bg-brand text-white rounded-lg hover:brightness-110 disabled:opacity-50 cursor-pointer">
        {importing ? $_('common.loading') : $_('checklists.importConfirm')}
      </button>
    </div>
  </div>
</div>
{/if}
