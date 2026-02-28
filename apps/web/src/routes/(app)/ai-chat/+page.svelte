<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { api } from '$lib/api/client';
  import { currentProjectStore } from '$lib/stores/projects';
  import { tick } from 'svelte';

  interface Message {
    role: 'user' | 'assistant';
    content: string;
    time: string;
  }

  let messages: Message[] = [];
  let input = '';
  let loading = false;
  let container: HTMLElement;

  $: examples = [
    $_('aiChat.examples.1'),
    $_('aiChat.examples.2'),
    $_('aiChat.examples.3'),
    $_('aiChat.examples.4'),
    $_('aiChat.examples.5'),
  ];

  async function send() {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    input = '';
    messages = [...messages, { role: 'user', content: msg, time: new Date().toLocaleTimeString() }];
    loading = true;
    await tick();
    container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });

    try {
      const res = await api.post<{ message: string }>('/agent/chat', {
        message: msg,
        projectId: $currentProjectStore?.id,
        history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      });
      messages = [...messages, { role: 'assistant', content: res.message, time: new Date().toLocaleTimeString() }];
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
</script>

<div class="flex flex-col h-full max-h-[calc(100vh-56px)]">
  <div class="px-6 py-4 border-b border-gray-200 flex-shrink-0 flex items-center justify-between">
    <div>
      <h1 class="text-xl font-bold text-gray-900">{$_('aiChat.title')}</h1>
      {#if $currentProjectStore}
        <p class="text-xs text-gray-500 mt-0.5">{$_('aiChat.project')}: <span class="font-medium text-primary-600">{$currentProjectStore.name}</span></p>
      {/if}
    </div>
    {#if messages.length > 0}
      <button on:click={() => messages = []} class="text-xs text-gray-400 hover:text-gray-600 transition-colors duration-150 cursor-pointer">{$_('aiChat.clearHistory')}</button>
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
