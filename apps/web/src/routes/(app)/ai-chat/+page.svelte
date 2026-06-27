<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { api } from '$lib/api/client';
  import { currentProjectStore, organizationIdStore, projectsStore } from '$lib/stores/projects';
  import { currentUser } from '$lib/stores/auth';
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { marked } from 'marked';

  $: memberships = ($currentUser as any)?.memberships || [];
  $: currentOrg = memberships.find((m: any) => m.organization?.id === $organizationIdStore)?.organization;

  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  function renderMarkdown(content: string): string {
    return marked.parse(content, { async: false }) as string;
  }

  interface Message {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    time: string;
  }

  interface ChatSession {
    id: string;
    title: string;
    projectId: string | null;
    createdAt: string;
    updatedAt: string;
  }

  let sessions: ChatSession[] = [];
  let currentSessionId = '';
  let messages: Message[] = [];
  let input = '';
  let loading = false;
  let sessionsLoading = true;
  let container: HTMLElement;
  let showScopePicker = false;

  function getSessionProjectName(session: ChatSession): string | null {
    if (!session.projectId) return null;
    if ($currentProjectStore?.id === session.projectId) return $currentProjectStore.name;
    const found = $projectsStore.find(p => p.id === session.projectId);
    return found?.name || null;
  }

  $: examples = $currentProjectStore
    ? [
        $_('aiChat.contextual.socialWeek', { values: { name: $currentProjectStore.name } }),
        $_('aiChat.contextual.strategy', { values: { industry: $currentProjectStore.industry || $_('aiChat.contextual.defaultIndustry') } }),
        $_('aiChat.contextual.launchEmail', { values: { name: $currentProjectStore.name } }),
        $_('aiChat.contextual.plan30'),
        $_('aiChat.contextual.channelAdvice', { values: { industry: $currentProjectStore.industry || $_('aiChat.contextual.defaultIndustry') } }),
      ]
    : [
        $_('aiChat.examples.1'),
        $_('aiChat.examples.2'),
        $_('aiChat.examples.3'),
        $_('aiChat.examples.4'),
        $_('aiChat.examples.5'),
      ];

  let isFromGettingStarted = false;

  onMount(async () => {
    await loadSessions();
    // Auto-open session from ?session= URL param (used by GSC "Continue in chat")
    const sessionParam = $page.url.searchParams.get('session');
    if (sessionParam) {
      await selectSession(sessionParam);
    }
    // Pre-fill from ?prompt= URL param (used by Getting Started "Do it now" links)
    const promptParam = $page.url.searchParams.get('prompt');
    if (promptParam) {
      input = promptParam;
      isFromGettingStarted = true;
    }
  });

  async function loadSessions() {
    sessionsLoading = true;
    try {
      sessions = await api.get<ChatSession[]>('/chat/sessions');
    } catch {
      sessions = [];
    } finally {
      sessionsLoading = false;
    }
  }

  async function createSession() {
    try {
      const session = await api.post<ChatSession>('/chat/sessions', {
        projectId: $currentProjectStore?.id || null,
        title: $_('aiChat.newChat'),
      });
      sessions = [session, ...sessions];
      await selectSession(session.id);
    } catch { /* ignore */ }
  }

  async function selectSession(sessionId: string) {
    currentSessionId = sessionId;
    showScopePicker = false;

    // Restore project context from session
    const session = sessions.find(s => s.id === sessionId);
    if (session?.projectId) {
      const project = $projectsStore.find(p => p.id === session.projectId);
      if (project) currentProjectStore.set(project);
    }

    try {
      const msgs = await api.get<any[]>(`/chat/sessions/${sessionId}/messages`);
      messages = msgs.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        time: new Date(m.createdAt).toLocaleTimeString(),
      }));
    } catch {
      messages = [];
    }
    await tick();
    container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }

  let deletingSessionId: string | null = null;

  function confirmDeleteSession(sessionId: string) {
    deletingSessionId = sessionId;
  }

  async function deleteSession() {
    if (!deletingSessionId) return;
    const sessionId = deletingSessionId;
    deletingSessionId = null;
    try {
      await api.delete(`/chat/sessions/${sessionId}`);
      sessions = sessions.filter(s => s.id !== sessionId);
      if (currentSessionId === sessionId) {
        currentSessionId = '';
        messages = [];
      }
    } catch { /* ignore */ }
  }

  async function send() {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    input = '';

    // Auto-create session if none selected
    if (!currentSessionId) {
      try {
        const session = await api.post<ChatSession>('/chat/sessions', {
          projectId: $currentProjectStore?.id || null,
          title: msg.slice(0, 50),
        });
        sessions = [session, ...sessions];
        currentSessionId = session.id;
      } catch { /* ignore */ }
    }

    const userMsg: Message = { role: 'user', content: msg, time: new Date().toLocaleTimeString() };
    messages = [...messages, userMsg];
    loading = true;
    await tick();
    container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });

    try {
      // Save user message
      if (currentSessionId) {
        api.post<{ id: string }>(`/chat/sessions/${currentSessionId}/messages`, { role: 'user', content: msg })
          .then(saved => { userMsg.id = saved.id; messages = messages; })
          .catch(() => {});
      }

      const res = await api.post<{ message: string }>('/agent/chat', {
        message: msg,
        projectId: $currentProjectStore?.id,
        history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      });
      const assistantMsg: Message = { role: 'assistant', content: res.message, time: new Date().toLocaleTimeString() };
      messages = [...messages, assistantMsg];

      // Save assistant message
      if (currentSessionId) {
        api.post<{ id: string }>(`/chat/sessions/${currentSessionId}/messages`, { role: 'assistant', content: res.message })
          .then(saved => { assistantMsg.id = saved.id; messages = messages; })
          .catch(() => {});
      }

      // Mark Getting Started "AI Strategy" step as done
      if (isFromGettingStarted && browser && $currentProjectStore?.id) {
        localStorage.setItem(`gs_ai_strategy_${$currentProjectStore.id}`, 'true');
        isFromGettingStarted = false;
      }
    } catch {
      messages = [...messages, { role: 'assistant', content: $_('aiChat.error'), time: new Date().toLocaleTimeString() }];
    } finally {
      loading = false;
      await tick();
      container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }

  async function deleteMessage(msg: Message, index: number) {
    if (msg.id) {
      try {
        await api.delete(`/chat/messages/${msg.id}`);
      } catch { /* ignore */ }
    }
    messages = messages.filter((_, i) => i !== index);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function startNewChat() {
    currentSessionId = '';
    messages = [];
    showScopePicker = true;
  }

  function selectScope(projectId: string | null) {
    if (projectId) {
      const project = $projectsStore.find(p => p.id === projectId);
      if (project) currentProjectStore.set(project);
    } else {
      currentProjectStore.set(null);
    }
    showScopePicker = false;
  }
</script>

<div class="flex h-full max-h-[calc(100vh-56px)]">
  <!-- Sessions sidebar -->
  <div class="w-64 border-r border-border flex flex-col flex-shrink-0 bg-surface-2">
    <div class="p-3 border-b border-border">
      <button on:click={startNewChat}
        class="w-full flex items-center gap-2 px-3 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:brightness-110 transition-colors duration-150 cursor-pointer">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        {$_('aiChat.newChat')}
      </button>
    </div>
    <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
      {#if sessionsLoading}
        {#each Array(3) as _}
          <div class="animate-pulse bg-surface-2 rounded-lg h-10"></div>
        {/each}
      {:else}
        {#each sessions as session}
          <div class="group flex items-start gap-1">
            <button
              on:click={() => selectSession(session.id)}
              class="flex-1 min-w-0 text-left px-3 py-2 rounded-lg transition-colors duration-150 cursor-pointer
                {currentSessionId === session.id ? 'bg-brand-subtle/10 text-brand font-medium' : 'text-ink-muted hover:bg-surface-2'}"
            >
              <span class="block text-sm truncate">{session.title}</span>
              {#if getSessionProjectName(session)}
                <span class="block text-[10px] text-ink-subtle truncate mt-0.5">{getSessionProjectName(session)}</span>
              {:else}
                <span class="block text-[10px] text-ink-subtle italic truncate mt-0.5">{$_('aiChat.orgLevel')}</span>
              {/if}
            </button>
            <button
              on:click|stopPropagation={() => confirmDeleteSession(session.id)}
              class="{currentSessionId === session.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} mt-2 p-1.5 text-ink-subtle hover:text-red-500 hover:bg-red-500/12 rounded-md transition-all duration-150 cursor-pointer flex-shrink-0"
              title={$_('aiChat.deleteChat.title')}
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
            </button>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Chat area -->
  <div class="flex-1 flex flex-col">
    <div class="px-6 py-4 border-b border-border flex-shrink-0 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-ink">{$_('aiChat.title')}</h1>
        <div class="flex items-center gap-1.5 mt-0.5 text-xs text-ink-muted">
          {#if currentOrg}
            <span class="inline-flex items-center gap-1">
              <svg class="w-3 h-3 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
              <span class="font-medium text-ink">{currentOrg.name}</span>
            </span>
          {/if}
          {#if $currentProjectStore}
            <svg class="w-3 h-3 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
            <span class="inline-flex items-center gap-1">
              <svg class="w-3 h-3 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
              <span class="font-medium text-brand">{$currentProjectStore.name}</span>
            </span>
          {:else if currentOrg}
            <svg class="w-3 h-3 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
            <span class="text-ink-subtle italic">{$_('aiChat.noProject')}</span>
          {/if}
        </div>
      </div>
      {#if messages.length > 0}
        <button on:click={startNewChat} class="text-xs text-ink-subtle hover:text-ink-muted transition-colors duration-150 cursor-pointer">{$_('aiChat.clearHistory')}</button>
      {/if}
    </div>

    <div bind:this={container} class="flex-1 overflow-y-auto p-6 space-y-4">
      {#if messages.length === 0 && showScopePicker}
        <!-- Scope picker: choose org-level or project -->
        <div class="flex flex-col items-center justify-center h-full text-center py-12">
          <div class="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-ink mb-1">{$_('aiChat.newChat')}</h2>
          <p class="text-ink-muted mb-6 max-w-sm text-sm">{$_('aiChat.scopePicker.subtitle')}</p>
          <div class="flex flex-col gap-2 w-full max-w-sm">
            <!-- Organization-level option -->
            {#if currentOrg}
              <button on:click={() => selectScope(null)}
                class="flex items-center gap-3 px-4 py-3 bg-surface border border-border rounded-xl hover:border-primary-300 hover:bg-brand-subtle/10 transition-colors duration-150 text-left cursor-pointer group">
                <div class="w-9 h-9 bg-surface-2 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100">
                  <svg class="w-5 h-5 text-ink-muted group-hover:text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                </div>
                <div>
                  <p class="text-sm font-medium text-ink">{currentOrg.name}</p>
                  <p class="text-xs text-ink-subtle">{$_('aiChat.scopePicker.orgHint')}</p>
                </div>
              </button>
            {/if}
            <!-- Project options -->
            {#each $projectsStore as project}
              <button on:click={() => selectScope(project.id)}
                class="flex items-center gap-3 px-4 py-3 bg-surface border border-border rounded-xl hover:border-primary-300 hover:bg-brand-subtle/10 transition-colors duration-150 text-left cursor-pointer group">
                <div class="w-9 h-9 bg-surface-2 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100">
                  <svg class="w-5 h-5 text-ink-muted group-hover:text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
                </div>
                <div>
                  <p class="text-sm font-medium text-ink">{project.name}</p>
                  <p class="text-xs text-ink-subtle">{project.industry || $_('aiChat.scopePicker.projectHint')}</p>
                </div>
              </button>
            {/each}
          </div>
        </div>
      {:else if messages.length === 0}
        <div class="flex flex-col items-center justify-center h-full text-center py-12">
          <div class="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-ink mb-1">{$_('aiChat.title')}</h2>
          {#if $currentProjectStore}
            <p class="text-ink-muted mb-2 max-w-sm text-sm">{$_('aiChat.chatContext.project', { values: { name: $currentProjectStore.name } })}</p>
          {:else if currentOrg}
            <p class="text-ink-muted mb-2 max-w-sm text-sm">{$_('aiChat.chatContext.orgOnly', { values: { org: currentOrg.name } })}</p>
          {/if}
          <p class="text-ink-muted mb-8 max-w-sm text-sm">{$_('aiChat.examples.title')}</p>
          <div class="flex flex-col gap-2 w-full max-w-md">
            {#if $currentProjectStore}
              <p class="text-xs text-ink-subtle mb-1 text-left">{$_('aiChat.contextualHint', { values: { name: $currentProjectStore.name } })}</p>
            {/if}
            {#each examples as ex}
              <button on:click={() => { input = ex; send(); }}
                class="text-sm px-4 py-2.5 bg-surface border border-border text-ink rounded-xl hover:border-primary-300 hover:bg-brand-subtle/10 hover:text-primary-700 transition-colors duration-150 text-left cursor-pointer">
                {ex}
              </button>
            {/each}
          </div>
        </div>
      {:else}
        {#each messages as msg, i}
          <div class="group flex {msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-3">
            {#if msg.role === 'assistant'}
              <div class="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
            {/if}
            <div class="max-w-2xl">
              <div class="{msg.role === 'user' ? 'bg-brand text-white rounded-2xl rounded-tr-sm' : 'bg-surface border border-border text-ink rounded-2xl rounded-tl-sm'} px-4 py-3 shadow-sm">
                {#if msg.role === 'assistant'}
                  <div class="text-sm leading-relaxed prose prose-sm prose-primary max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-pre:my-2 prose-code:text-primary-700 prose-code:bg-brand-subtle/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-[''] prose-code:after:content-['']">
                    {@html renderMarkdown(msg.content)}
                  </div>
                {:else}
                  <p class="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                {/if}
              </div>
              <div class="flex items-center gap-1.5 mt-1 {msg.role === 'user' ? 'justify-end' : ''}">
                <p class="text-xs text-ink-subtle">{msg.time}</p>
                <button
                  on:click={() => deleteMessage(msg, i)}
                  class="hidden group-hover:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-ink-subtle hover:text-red-500 hover:bg-red-500/12 rounded transition-all duration-150 cursor-pointer"
                  title={$_('aiChat.deleteMessage')}
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                </button>
              </div>
            </div>
          </div>
        {/each}
        {#if loading}
          <div class="flex justify-start gap-3">
            <div class="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div class="bg-surface border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div class="flex gap-1 items-center h-5">
                <div class="w-2 h-2 bg-primary-300 rounded-full animate-bounce" style="animation-delay:0ms"></div>
                <div class="w-2 h-2 bg-primary-300 rounded-full animate-bounce" style="animation-delay:150ms"></div>
                <div class="w-2 h-2 bg-primary-300 rounded-full animate-bounce" style="animation-delay:300ms"></div>
              </div>
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <div class="p-4 border-t border-border flex-shrink-0 bg-surface">
      <div class="flex gap-3 items-end max-w-4xl mx-auto">
        <textarea
          bind:value={input}
          on:keydown={onKeydown}
          placeholder={$_('aiChat.placeholder')}
          rows="2"
          class="flex-1 px-4 py-3 border border-border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none text-sm"
        ></textarea>
        <button
          on:click={send}
          disabled={loading || !input.trim()}
          aria-label={$_('aiChat.send')}
          class="bg-brand text-white p-3 rounded-xl hover:brightness-110 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 cursor-pointer"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</div>

<!-- Delete session confirmation modal -->
{#if deletingSessionId}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" on:click|self={() => deletingSessionId = null} on:keydown={(e) => e.key === 'Escape' && (deletingSessionId = null)} role="dialog" tabindex="-1">
    <div class="bg-surface rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
        </div>
        <div>
          <h3 class="text-base font-semibold text-ink">{$_('aiChat.deleteChat.title')}</h3>
          <p class="text-sm text-ink-muted mt-0.5">{$_('aiChat.deleteChat.message')}</p>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button on:click={() => deletingSessionId = null}
          class="px-4 py-2 text-sm font-medium text-ink bg-surface-2 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer">
          {$_('aiChat.deleteChat.cancel')}
        </button>
        <button on:click={deleteSession}
          class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors cursor-pointer">
          {$_('aiChat.deleteChat.confirm')}
        </button>
      </div>
    </div>
  </div>
{/if}
