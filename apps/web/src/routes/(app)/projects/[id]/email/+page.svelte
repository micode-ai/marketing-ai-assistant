<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore, currentProjectStore, projectsStore } from '$stores/projects';
  import SectionHint from '$lib/components/SectionHint.svelte';

  $: projectId = $page.params['id'];

  // Sync picker with this project
  $: if ($projectsStore.length > 0 && projectId) {
    const project = $projectsStore.find((p: any) => p.id === projectId);
    if (project && $currentProjectStore?.id !== projectId) {
      currentProjectStore.set(project);
    }
  }

  // Reload when the URL project id changes. SvelteKit reuses this component
  // across /projects/A → /projects/B, so onMount does NOT fire again — without
  // this watcher the page keeps showing the previous project's data.
  let mounted = false;
  let prevProjectId: string | undefined = '';
  $: if (mounted && projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    reloadForProject();
  }

  function reloadForProject() {
    lists = [];
    campaigns = [];
    selectedList = null;
    subscribers = [];
    loadLists();
    loadCampaigns();
  }

  // ── Types ────────────────────────────────────────────────────────────────
  interface EmailList {
    id: string;
    name: string;
    description?: string;
    subscriberCount: number;
    createdAt: string;
    _count?: { subscribers: number };
  }

  interface EmailSubscriber {
    id: string;
    email: string;
    name?: string;
    status: 'ACTIVE' | 'UNSUBSCRIBED' | 'BOUNCED';
    subscribedAt: string;
  }

  interface EmailCampaign {
    id: string;
    subject: string;
    status: string;
    sentAt?: string;
    createdAt: string;
    previewText?: string;
    stats?: { sent: number; opens: number; clicks: number; bounces: number; unsubscribes: number };
    list?: { name: string };
    emailAccount?: { email: string; displayName?: string };
  }

  interface EmailAccount {
    id: string;
    email: string;
    displayName?: string;
    provider: 'SMTP' | 'RESEND';
    status: string;
  }

  // ── State ────────────────────────────────────────────────────────────────
  let activeTab: 'lists' | 'campaigns' = 'lists';

  // Lists tab
  let lists: EmailList[] = [];
  let listsLoading = true;
  let listsError = '';

  // Create list modal
  let showCreateListModal = false;
  let newListName = '';
  let newListDesc = '';
  let creatingList = false;
  let createListError = '';

  // Subscribers modal
  let selectedList: EmailList | null = null;
  let subscribers: EmailSubscriber[] = [];
  let subscribersLoading = false;
  let subscribersError = '';
  let newSubEmail = '';
  let newSubName = '';
  let addingSubscriber = false;
  let addSubError = '';

  // Campaigns tab
  let campaigns: EmailCampaign[] = [];
  let campaignsLoading = true;
  let campaignsError = '';

  // Send campaign modal
  let showSendModal = false;
  let emailAccounts: EmailAccount[] = [];
  let accountsLoading = false;
  let campaignForm = {
    emailAccountId: '',
    listId: '',
    subject: '',
    previewText: '',
    html: '',
  };
  let sending = false;
  let sendError = '';
  let sendSuccess = '';

  // General
  let successMsg = '';

  // ── Lifecycle ────────────────────────────────────────────────────────────
  onMount(() => {
    loadLists();
    loadCampaigns();
    prevProjectId = projectId;
    mounted = true;
  });

  // ── Lists ────────────────────────────────────────────────────────────────
  async function loadLists() {
    listsLoading = true;
    listsError = '';
    try {
      lists = await api.get<EmailList[]>('/email/lists', { projectId });
    } catch (e: any) {
      listsError = e.message;
    } finally {
      listsLoading = false;
    }
  }

  async function createList() {
    if (!newListName.trim()) return;
    creatingList = true;
    createListError = '';
    try {
      await api.post('/email/lists', { projectId, name: newListName.trim(), description: newListDesc.trim() || undefined });
      newListName = '';
      newListDesc = '';
      showCreateListModal = false;
      await loadLists();
    } catch (e: any) {
      createListError = e.message;
    } finally {
      creatingList = false;
    }
  }

  async function deleteList(list: EmailList) {
    if (!confirm($_('email.deleteListConfirm', { values: { name: list.name } }))) return;
    try {
      await api.delete(`/email/lists/${list.id}`);
      lists = lists.filter((l) => l.id !== list.id);
    } catch (e: any) {
      listsError = e.message;
    }
  }

  // ── Subscribers ──────────────────────────────────────────────────────────
  async function openSubscribers(list: EmailList) {
    selectedList = list;
    subscribers = [];
    subscribersLoading = true;
    subscribersError = '';
    addSubError = '';
    newSubEmail = '';
    newSubName = '';
    try {
      subscribers = await api.get<EmailSubscriber[]>(`/email/lists/${list.id}/subscribers`, { all: 'true' });
    } catch (e: any) {
      subscribersError = e.message;
    } finally {
      subscribersLoading = false;
    }
  }

  async function addSubscriber() {
    if (!selectedList || !newSubEmail.trim()) return;
    addingSubscriber = true;
    addSubError = '';
    try {
      const sub = await api.post<EmailSubscriber>(`/email/lists/${selectedList.id}/subscribers`, {
        email: newSubEmail.trim(),
        name: newSubName.trim() || undefined,
      });
      subscribers = [sub, ...subscribers.filter((s) => s.email !== sub.email)];
      newSubEmail = '';
      newSubName = '';
      // Refresh count
      lists = lists.map((l) => l.id === selectedList!.id ? { ...l, subscriberCount: l.subscriberCount + 1 } : l);
    } catch (e: any) {
      addSubError = e.message;
    } finally {
      addingSubscriber = false;
    }
  }

  async function removeSubscriber(sub: EmailSubscriber) {
    if (!selectedList) return;
    try {
      await api.delete(`/email/lists/${selectedList.id}/subscribers/${sub.id}`);
      subscribers = subscribers.filter((s) => s.id !== sub.id);
      if (sub.status === 'ACTIVE') {
        lists = lists.map((l) => l.id === selectedList!.id ? { ...l, subscriberCount: Math.max(0, l.subscriberCount - 1) } : l);
      }
    } catch (e: any) {
      subscribersError = e.message;
    }
  }

  // ── Campaigns ────────────────────────────────────────────────────────────
  async function loadCampaigns() {
    campaignsLoading = true;
    campaignsError = '';
    try {
      campaigns = await api.get<EmailCampaign[]>('/email/campaigns', { projectId });
    } catch (e: any) {
      campaignsError = e.message;
    } finally {
      campaignsLoading = false;
    }
  }

  async function openSendModal() {
    campaignForm = { emailAccountId: '', listId: '', subject: '', previewText: '', html: '' };
    sendError = '';
    sendSuccess = '';
    showSendModal = true;
    if (emailAccounts.length === 0) {
      accountsLoading = true;
      try {
        emailAccounts = await api.get<EmailAccount[]>('/email/accounts', { organizationId: $organizationIdStore ?? undefined });
      } catch (e: any) {
        sendError = e.message;
      } finally {
        accountsLoading = false;
      }
    }
  }

  async function sendCampaign() {
    if (!campaignForm.emailAccountId || !campaignForm.listId || !campaignForm.subject || !campaignForm.html) return;
    sending = true;
    sendError = '';
    sendSuccess = '';
    try {
      const result = await api.post<{ sent: number; total: number }>('/email/campaigns/send', {
        emailAccountId: campaignForm.emailAccountId,
        listId: campaignForm.listId,
        subject: campaignForm.subject,
        previewText: campaignForm.previewText || undefined,
        html: campaignForm.html,
      });
      sendSuccess = $_('email.campaignSent', { values: { count: result.sent } });
      await loadCampaigns();
      setTimeout(() => {
        showSendModal = false;
        sendSuccess = '';
      }, 2000);
    } catch (e: any) {
      sendError = e.message;
    } finally {
      sending = false;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function pct(part: number, total: number): string {
    if (!total) return '0%';
    return Math.round((part / total) * 100) + '%';
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const statusColors: Record<string, string> = {
    sent: 'bg-green-100 text-green-700',
    sending: 'bg-yellow-100 text-yellow-700',
    draft: 'bg-surface-2 text-ink-muted',
  };

  const subStatusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    UNSUBSCRIBED: 'bg-surface-2 text-ink-muted',
    BOUNCED: 'bg-red-100 text-red-700',
  };
</script>

<div class="p-4 sm:p-6">
  <SectionHint sectionKey="email" titleKey="hints.email.title" descKey="hints.email.desc" />
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-ink">{$_('email.title')}</h1>
    </div>
    {#if activeTab === 'lists'}
      <button
        on:click={() => (showCreateListModal = true)}
        class="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        {$_('email.createList')}
      </button>
    {:else}
      <button
        on:click={openSendModal}
        class="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
        {$_('email.sendCampaign')}
      </button>
    {/if}
  </div>

  <!-- Tabs -->
  <div class="flex gap-1 mb-6 bg-surface-2 p-1 rounded-xl w-fit">
    <button
      on:click={() => (activeTab = 'lists')}
      class="px-4 py-2 text-sm font-medium rounded-lg transition-colors {activeTab === 'lists' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-gray-700'}"
    >
      {$_('email.tabLists')}
    </button>
    <button
      on:click={() => (activeTab = 'campaigns')}
      class="px-4 py-2 text-sm font-medium rounded-lg transition-colors {activeTab === 'campaigns' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-gray-700'}"
    >
      {$_('email.tabCampaigns')}
    </button>
  </div>

  <!-- ── LISTS TAB ────────────────────────────────────────────────────── -->
  {#if activeTab === 'lists'}
    {#if listsError}
      <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{listsError}</div>
    {/if}

    {#if listsLoading}
      <div class="flex justify-center py-16">
        <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if lists.length === 0}
      <div class="text-center py-16 bg-surface-2 rounded-xl border border-dashed border-border">
        <div class="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg class="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p class="text-ink font-medium text-sm">{$_('email.noLists')}</p>
        <button
          on:click={() => (showCreateListModal = true)}
          class="mt-3 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {$_('email.createList')}
        </button>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each lists as list (list.id)}
          <div class="bg-surface border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-indigo-200 transition-colors">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <h3 class="font-semibold text-ink text-sm truncate">{list.name}</h3>
                {#if list.description}
                  <p class="text-xs text-ink-subtle mt-0.5 line-clamp-2">{list.description}</p>
                {/if}
              </div>
              <button
                on:click={() => deleteList(list)}
                class="text-ink-subtle hover:text-red-500 transition-colors shrink-0"
                title={$_('email.deleteList')}
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>

            <div class="flex items-center gap-1.5 text-indigo-600">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span class="text-sm font-medium">{list.subscriberCount}</span>
              <span class="text-xs text-ink-subtle">{$_('email.subscribers').toLowerCase()}</span>
            </div>

            <div class="text-xs text-ink-subtle">{formatDate(list.createdAt)}</div>

            <button
              on:click={() => openSubscribers(list)}
              class="w-full text-center text-sm font-medium text-indigo-600 border border-indigo-100 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              {$_('email.viewSubscribers')}
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- ── CAMPAIGNS TAB ────────────────────────────────────────────────── -->
  {#if activeTab === 'campaigns'}
    {#if campaignsError}
      <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{campaignsError}</div>
    {/if}

    {#if campaignsLoading}
      <div class="flex justify-center py-16">
        <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if campaigns.length === 0}
      <div class="text-center py-16 bg-surface-2 rounded-xl border border-dashed border-border">
        <div class="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg class="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
        <p class="text-ink font-medium text-sm">{$_('email.noCampaigns')}</p>
        <button
          on:click={openSendModal}
          class="mt-3 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {$_('email.sendCampaign')}
        </button>
      </div>
    {:else}
      <div class="space-y-3">
        {#each campaigns as campaign (campaign.id)}
          <div class="bg-surface border border-border rounded-xl p-5">
            <div class="flex items-start justify-between gap-3 mb-3">
              <div class="min-w-0">
                <h3 class="font-semibold text-ink text-sm">{campaign.subject}</h3>
                {#if campaign.previewText}
                  <p class="text-xs text-ink-subtle mt-0.5">{campaign.previewText}</p>
                {/if}
              </div>
              <span class="text-xs px-2.5 py-1 rounded-full font-medium shrink-0 {statusColors[campaign.status] ?? 'bg-surface-2 text-ink-muted'}">
                {campaign.status}
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted mb-3">
              {#if campaign.list}
                <span class="flex items-center gap-1">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {campaign.list.name}
                </span>
              {/if}
              {#if campaign.emailAccount}
                <span class="flex items-center gap-1">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {campaign.emailAccount.displayName ?? campaign.emailAccount.email}
                </span>
              {/if}
              {#if campaign.sentAt}
                <span>{formatDate(campaign.sentAt)}</span>
              {:else}
                <span>{formatDate(campaign.createdAt)}</span>
              {/if}
            </div>

            {#if campaign.stats && campaign.stats.sent > 0}
              <div class="flex flex-wrap gap-4 pt-3 border-t border-border">
                <div class="text-center">
                  <div class="text-sm font-bold text-ink">{campaign.stats.sent}</div>
                  <div class="text-xs text-ink-subtle">{$_('email.sent')}</div>
                </div>
                <div class="text-center">
                  <div class="text-sm font-bold text-ink">{pct(campaign.stats.opens, campaign.stats.sent)}</div>
                  <div class="text-xs text-ink-subtle">{$_('email.openRate')}</div>
                </div>
                <div class="text-center">
                  <div class="text-sm font-bold text-ink">{pct(campaign.stats.clicks, campaign.stats.sent)}</div>
                  <div class="text-xs text-ink-subtle">{$_('email.clickRate')}</div>
                </div>
                <div class="text-center">
                  <div class="text-sm font-bold text-ink">{campaign.stats.bounces}</div>
                  <div class="text-xs text-ink-subtle">{$_('email.bounces')}</div>
                </div>
                <div class="text-center">
                  <div class="text-sm font-bold text-ink">{campaign.stats.unsubscribes}</div>
                  <div class="text-xs text-ink-subtle">{$_('email.unsubscribes')}</div>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- ── CREATE LIST MODAL ────────────────────────────────────────────────── -->
{#if showCreateListModal}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    on:click|self={() => (showCreateListModal = false)}
    on:keydown={(e) => e.key === 'Escape' && (showCreateListModal = false)}
  >
    <div class="bg-surface rounded-2xl shadow-xl w-full max-w-sm">
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-semibold text-ink">{$_('email.createListTitle')}</h2>
          <button on:click={() => (showCreateListModal = false)} class="text-ink-subtle hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {#if createListError}
          <div class="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{createListError}</div>
        {/if}

        <form on:submit|preventDefault={createList} class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-ink mb-1">{$_('email.listName')} *</label>
            <input
              type="text"
              bind:value={newListName}
              required
              placeholder={$_('email.placeholderListName')}
              class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink mb-1">
              {$_('common.description')} <span class="text-ink-subtle font-normal">({$_('common.optional')})</span>
            </label>
            <input
              type="text"
              bind:value={newListDesc}
              placeholder={$_('email.placeholderListDesc')}
              class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div class="flex gap-3 pt-1">
            <button
              type="button"
              on:click={() => (showCreateListModal = false)}
              class="flex-1 border border-border text-ink text-sm font-medium py-2.5 rounded-xl hover:bg-surface-2 transition-colors"
            >
              {$_('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={creatingList}
              class="flex-1 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {creatingList ? $_('common.loading') : $_('email.createList')}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<!-- ── SUBSCRIBERS MODAL ────────────────────────────────────────────────── -->
{#if selectedList}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    on:click|self={() => (selectedList = null)}
    on:keydown={(e) => e.key === 'Escape' && (selectedList = null)}
  >
    <div class="bg-surface rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
      <div class="p-6 border-b border-border shrink-0">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-ink">{selectedList.name}</h2>
            <p class="text-sm text-ink-subtle mt-0.5">{$_('email.subscribers')}</p>
          </div>
          <button on:click={() => (selectedList = null)} class="text-ink-subtle hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Add subscriber inline form -->
        <form on:submit|preventDefault={addSubscriber} class="mt-4 flex gap-2">
          <input
            type="email"
            bind:value={newSubEmail}
            required
            placeholder={$_('email.subscriberEmail')}
            class="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            bind:value={newSubName}
            placeholder={$_('email.subscriberName')}
            class="w-36 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={addingSubscriber}
            class="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            {addingSubscriber ? '...' : $_('email.addSubscriber')}
          </button>
        </form>
        {#if addSubError}
          <p class="text-xs text-red-600 mt-2">{addSubError}</p>
        {/if}
      </div>

      <!-- Subscriber list -->
      <div class="overflow-y-auto flex-1">
        {#if subscribersLoading}
          <div class="flex justify-center py-10">
            <div class="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        {:else if subscribersError}
          <div class="px-6 py-4 text-sm text-red-600">{subscribersError}</div>
        {:else if subscribers.length === 0}
          <div class="text-center py-10 text-ink-subtle text-sm">{$_('email.noSubscribers')}</div>
        {:else}
          <table class="w-full text-sm">
            <thead class="bg-surface-2 sticky top-0">
              <tr>
                <th class="text-left px-6 py-3 text-xs font-medium text-ink-muted uppercase tracking-wide">{$_('email.subscriberEmail')}</th>
                <th class="text-left px-3 py-3 text-xs font-medium text-ink-muted uppercase tracking-wide">{$_('email.subscriberName')}</th>
                <th class="text-left px-3 py-3 text-xs font-medium text-ink-muted uppercase tracking-wide">{$_('common.status')}</th>
                <th class="text-left px-3 py-3 text-xs font-medium text-ink-muted uppercase tracking-wide">{$_('common.date')}</th>
                <th class="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              {#each subscribers as sub (sub.id)}
                <tr class="hover:bg-surface-2 transition-colors">
                  <td class="px-6 py-3 text-ink font-medium">{sub.email}</td>
                  <td class="px-3 py-3 text-ink-muted">{sub.name ?? '—'}</td>
                  <td class="px-3 py-3">
                    <span class="text-xs px-2 py-0.5 rounded-full font-medium {subStatusColors[sub.status] ?? 'bg-surface-2 text-ink-muted'}">
                      {$_(`email.${sub.status.toLowerCase()}`) || sub.status}
                    </span>
                  </td>
                  <td class="px-3 py-3 text-ink-subtle text-xs">{formatDate(sub.subscribedAt)}</td>
                  <td class="px-3 py-3">
                    <button
                      on:click={() => removeSubscriber(sub)}
                      class="text-ink-subtle hover:text-red-500 transition-colors"
                      title={$_('email.removeSubscriber')}
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- ── SEND CAMPAIGN MODAL ──────────────────────────────────────────────── -->
{#if showSendModal}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    on:click|self={() => (showSendModal = false)}
    on:keydown={(e) => e.key === 'Escape' && (showSendModal = false)}
  >
    <div class="bg-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-semibold text-ink">{$_('email.sendCampaignTitle')}</h2>
          <button on:click={() => (showSendModal = false)} class="text-ink-subtle hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {#if sendSuccess}
          <div class="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm text-center font-medium">
            ✓ {sendSuccess}
          </div>
        {/if}
        {#if sendError}
          <div class="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{sendError}</div>
        {/if}

        {#if accountsLoading}
          <div class="flex justify-center py-8">
            <div class="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        {:else if emailAccounts.length === 0}
          <div class="text-center py-8">
            <p class="text-ink-muted text-sm mb-3">{$_('email.noAccounts')}</p>
            <a
              href="/settings/email-accounts"
              class="text-indigo-600 text-sm font-medium hover:underline"
            >
              {$_('email.goToEmailAccounts')}
            </a>
          </div>
        {:else}
          <form on:submit|preventDefault={sendCampaign} class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-ink mb-1">{$_('email.selectAccount')} *</label>
              <select
                bind:value={campaignForm.emailAccountId}
                required
                class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— {$_('email.selectAccount')} —</option>
                {#each emailAccounts as acc}
                  <option value={acc.id}>{acc.displayName ? `${acc.displayName} <${acc.email}>` : acc.email}</option>
                {/each}
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-ink mb-1">{$_('email.selectList')} *</label>
              <select
                bind:value={campaignForm.listId}
                required
                class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— {$_('email.selectList')} —</option>
                {#each lists as l}
                  <option value={l.id}>{l.name} ({l.subscriberCount} {$_('email.subscribers').toLowerCase()})</option>
                {/each}
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-ink mb-1">{$_('email.subject')} *</label>
              <input
                type="text"
                bind:value={campaignForm.subject}
                required
                placeholder={$_('email.placeholderSubject')}
                class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-ink mb-1">
                {$_('email.previewText')} <span class="text-ink-subtle font-normal">({$_('common.optional')})</span>
              </label>
              <input
                type="text"
                bind:value={campaignForm.previewText}
                placeholder={$_('email.placeholderPreviewText')}
                class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-ink mb-1">{$_('email.htmlContent')} *</label>
              <p class="text-xs text-ink-subtle mb-1.5">
                {$_('email.placeholderHint')}
              </p>
              <textarea
                bind:value={campaignForm.html}
                required
                rows="8"
                placeholder={$_('email.placeholderHtml')}
                class="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              ></textarea>
            </div>

            <div class="flex gap-3 pt-2">
              <button
                type="button"
                on:click={() => (showSendModal = false)}
                class="flex-1 border border-border text-ink text-sm font-medium py-2.5 rounded-xl hover:bg-surface-2 transition-colors"
              >
                {$_('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={sending || !!sendSuccess}
                class="flex-1 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {sending ? $_('email.sending') : $_('email.sendNow')}
              </button>
            </div>
          </form>
        {/if}
      </div>
    </div>
  </div>
{/if}
