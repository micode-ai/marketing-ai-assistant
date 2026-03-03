<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { api } from '$lib/api/client';
  import { currentProjectStore } from '$lib/stores/projects';
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';

  interface Message {
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

  onMount(async () => {
    await loadSessions();
    // Pre-fill from ?prompt= URL param (used by Getting Started "Do it now" links)
    const promptParam = $page.url.searchParams.get('prompt');
    if (promptParam) input = promptParam;
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
    try {
      const msgs = await api.get<any[]>(`/chat/sessions/${sessionId}/messages`);
      messages = msgs.map(m => ({
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

  async function deleteSession(sessionId: string) {
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

    messages = [...messages, { role: 'user', content: msg, time: new Date().toLocaleTimeString() }];
    loading = true;
    await tick();
    container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });

    try {
      // Save user message
      if (currentSessionId) {
        api.post(`/chat/sessions/${currentSessionId}/messages`, { role: 'user', content: msg }).catch(() => {});
      }

      const res = await api.post<{ message: string }>('/agent/chat', {
        message: msg,
        projectId: $currentProjectStore?.id,
        history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      });
      messages = [...messages, { role: 'assistant', content: res.message, time: new Date().toLocaleTimeString() }];

      // Save assistant message
      if (currentSessionId) {
        api.post(`/chat/sessions/${currentSessionId}/messages`, { role: 'assistant', content: res.message }).catch(() => {});
      }
    } catch {
      messages = [...messages, { role: 'assistant', content: $_('aiChat.error'), time: new Date().toLocaleTimeString() }];
    } finally {
      loading = false;
      await tick();
      container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function startNewChat() {
    currentSessionId = '';
    messages = [];
  }
</script>

<div class="flex h-full max-h-[calc(100vh-56px)]">
  <!-- Sessions sidebar -->
  <div class="w-64 border-r border-gray-200 flex flex-col flex-shrink-0 bg-gray-50">
    <div class="p-3 border-b border-gray-200">
      <button on:click={startNewChat}
        class="w-full flex items-center gap-2 px-3 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors duration-150 cursor-pointer">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        {$_('aiChat.newChat')}
      </button>
    </div>
    <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
      {#if sessionsLoading}
        {#each Array(3) as _}
          <div class="animate-pulse bg-gray-200 rounded-lg h-10"></div>
        {/each}
      {:else}
        {#each sessions as session}
          <div class="group flex items-center gap-1">
            <button
              on:click={() => selectSession(session.id)}
              class="flex-1 text-left px-3 py-2 text-sm rounded-lg truncate transition-colors duration-150 cursor-pointer
                {currentSessionId === session.id ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}"
            >
              {session.title}
            </button>
            <button
              on:click|stopPropagation={() => deleteSession(session.id)}
              class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all duration-150 cursor-pointer"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Chat area -->
  <div class="flex-1 flex flex-col">
    <div class="px-6 py-4 border-b border-gray-200 flex-shrink-0 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-gray-900">{$_('aiChat.title')}</h1>
        {#if $currentProjectStore}
          <p class="text-xs text-gray-500 mt-0.5">{$_('aiChat.project')}: <span class="font-medium text-primary-600">{$currentProjectStore.name}</span></p>
        {/if}
      </div>
      {#if messages.length > 0}
        <button on:click={startNewChat} class="text-xs text-gray-400 hover:text-gray-600 transition-colors duration-150 cursor-pointer">{$_('aiChat.clearHistory')}</button>
      {/if}
    </div>

    <div bind:this={container} class="flex-1 overflow-y-auto p-6 space-y-4">
      {#if messages.length === 0}
        <div class="flex flex-col items-center justify-center h-full text-center py-12">
          <div class="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-gray-900 mb-1">{$_('aiChat.title')}</h2>
          <p class="text-gray-500 mb-8 max-w-sm text-sm">{$_('aiChat.examples.title')}</p>
          <div class="flex flex-col gap-2 w-full max-w-md">
            {#if $currentProjectStore}
              <p class="text-xs text-gray-400 mb-1 text-left">{$_('aiChat.contextualHint', { values: { name: $currentProjectStore.name } })}</p>
            {/if}
            {#each examples as ex}
              <button on:click={() => { input = ex; send(); }}
                class="text-sm px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 transition-colors duration-150 text-left cursor-pointer">
                {ex}
              </button>
            {/each}
          </div>
        </div>
      {:else}
        {#each messages as msg}
          <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-3">
            {#if msg.role === 'assistant'}
              <div class="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
            {/if}
            <div class="max-w-2xl">
              <div class="{msg.role === 'user' ? 'bg-primary-600 text-white rounded-2xl rounded-tr-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm'} px-4 py-3 shadow-sm">
                <p class="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
              <p class="text-xs text-gray-400 mt-1 {msg.role === 'user' ? 'text-right' : ''}">{msg.time}</p>
            </div>
          </div>
        {/each}
        {#if loading}
          <div class="flex justify-start gap-3">
            <div class="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div class="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
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

    <div class="p-4 border-t border-gray-200 flex-shrink-0 bg-white">
      <div class="flex gap-3 items-end max-w-4xl mx-auto">
        <textarea
          bind:value={input}
          on:keydown={onKeydown}
          placeholder={$_('aiChat.placeholder')}
          rows="2"
          class="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none text-sm"
        ></textarea>
        <button
          on:click={send}
          disabled={loading || !input.trim()}
          aria-label={$_('aiChat.send')}
          class="bg-primary-600 text-white p-3 rounded-xl hover:bg-primary-700 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 cursor-pointer"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</div>
