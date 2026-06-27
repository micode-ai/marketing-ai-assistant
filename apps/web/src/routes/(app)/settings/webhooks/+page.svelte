<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  interface Webhook {
    id: string;
    url: string;
    events: string[];
    secret: string;
    isActive: boolean;
    lastTriggeredAt: string | null;
    createdAt: string;
  }

  const AVAILABLE_EVENTS = [
    'content.published',
    'campaign.sent',
    'conversion.tracked',
    'subscriber.added',
    'subscriber.unsubscribed',
    'agent.completed',
  ];

  let webhooks: Webhook[] = [];
  let loading = true;
  let error = '';
  let successMsg = '';

  // Add / Edit modal
  let showModal = false;
  let editingId: string | null = null;
  let form = { url: '', events: [] as string[] };
  let saving = false;
  let modalError = '';

  // Delete confirm
  let deletingId: string | null = null;

  // Secret visibility per webhook
  let visibleSecrets: Record<string, boolean> = {};

  // Copy feedback per webhook
  let copiedId: string | null = null;

  onMount(loadWebhooks);

  async function loadWebhooks() {
    loading = true;
    error = '';
    try {
      webhooks = await api.get<Webhook[]>('/webhooks');
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function openAddModal() {
    editingId = null;
    form = { url: '', events: [] };
    modalError = '';
    showModal = true;
  }

  function openEditModal(webhook: Webhook) {
    editingId = webhook.id;
    form = { url: webhook.url, events: [...webhook.events] };
    modalError = '';
    showModal = true;
  }

  function toggleEvent(event: string) {
    if (form.events.includes(event)) {
      form.events = form.events.filter((e) => e !== event);
    } else {
      form.events = [...form.events, event];
    }
  }

  async function saveWebhook() {
    if (!form.url || form.events.length === 0) return;
    saving = true;
    modalError = '';
    try {
      if (editingId) {
        const updated = await api.put<Webhook>(`/webhooks/${editingId}`, {
          url: form.url,
          events: form.events,
        });
        webhooks = webhooks.map((w) => (w.id === editingId ? updated : w));
      } else {
        const created = await api.post<Webhook>('/webhooks', {
          url: form.url,
          events: form.events,
        });
        webhooks = [...webhooks, created];
      }
      showModal = false;
      successMsg = $_('common.success');
      setTimeout(() => (successMsg = ''), 3000);
    } catch (e: any) {
      modalError = e.message;
    } finally {
      saving = false;
    }
  }

  async function toggleActive(webhook: Webhook) {
    try {
      const updated = await api.put<Webhook>(`/webhooks/${webhook.id}`, {
        isActive: !webhook.isActive,
      });
      webhooks = webhooks.map((w) => (w.id === webhook.id ? updated : w));
    } catch (e: any) {
      error = e.message;
      setTimeout(() => (error = ''), 3000);
    }
  }

  async function deleteWebhook(id: string) {
    try {
      await api.delete(`/webhooks/${id}`);
      webhooks = webhooks.filter((w) => w.id !== id);
      successMsg = $_('common.success');
      setTimeout(() => (successMsg = ''), 3000);
    } catch (e: any) {
      error = e.message;
      setTimeout(() => (error = ''), 3000);
    } finally {
      deletingId = null;
    }
  }

  function toggleSecretVisibility(id: string) {
    visibleSecrets = { ...visibleSecrets, [id]: !visibleSecrets[id] };
  }

  async function copySecret(secret: string, id: string) {
    try {
      await navigator.clipboard.writeText(secret);
      copiedId = id;
      setTimeout(() => (copiedId = null), 2000);
    } catch {
      // Fallback: do nothing
    }
  }

  function maskSecret(secret: string): string {
    if (!secret) return '';
    if (secret.length <= 8) return '*'.repeat(secret.length);
    return secret.slice(0, 4) + '*'.repeat(secret.length - 8) + secret.slice(-4);
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const eventColors: Record<string, string> = {
    'content.published': 'bg-blue-100 text-blue-700',
    'campaign.sent': 'bg-purple-100 text-purple-700',
    'conversion.tracked': 'bg-green-100 text-green-700',
    'subscriber.added': 'bg-amber-100 text-amber-700',
    'subscriber.unsubscribed': 'bg-red-100 text-red-700',
    'agent.completed': 'bg-indigo-100 text-indigo-700',
  };
</script>

<div class="p-6 max-w-3xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-ink">{$_('webhooks.title')}</h1>
      <p class="text-sm text-ink-muted mt-1">{$_('webhooks.subtitle')}</p>
    </div>
    <button
      on:click={openAddModal}
      class="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
      {$_('webhooks.addWebhook')}
    </button>
  </div>

  {#if error}
    <div class="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
  {/if}
  {#if successMsg}
    <div class="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">{successMsg}</div>
  {/if}

  <!-- Loading skeleton -->
  {#if loading}
    <div class="space-y-3">
      {#each Array(3) as _}
        <div class="bg-surface rounded-xl border border-border p-5 animate-pulse">
          <div class="flex items-center gap-4">
            <div class="flex-1 space-y-2">
              <div class="h-4 bg-gray-200 rounded w-2/3"></div>
              <div class="h-3 bg-surface-2 rounded w-1/3"></div>
              <div class="flex gap-2 mt-2">
                <div class="h-5 bg-surface-2 rounded-full w-24"></div>
                <div class="h-5 bg-surface-2 rounded-full w-20"></div>
              </div>
            </div>
            <div class="h-6 w-10 bg-gray-200 rounded-full"></div>
          </div>
        </div>
      {/each}
    </div>

  <!-- Empty state -->
  {:else if webhooks.length === 0}
    <div class="text-center py-16 bg-surface-2 rounded-xl border border-dashed border-border">
      <div class="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3">
        <svg class="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </div>
      <p class="text-ink font-medium text-sm">{$_('webhooks.empty')}</p>
      <p class="text-ink-subtle text-xs mt-1 mb-4">{$_('webhooks.emptyDesc')}</p>
      <button
        on:click={openAddModal}
        class="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
      >
        {$_('webhooks.addWebhook')}
      </button>
    </div>

  <!-- Webhook list -->
  {:else}
    <div class="space-y-3">
      {#each webhooks as webhook (webhook.id)}
        <div class="bg-surface rounded-xl border border-border p-5">
          <div class="flex items-start gap-4">
            <!-- Icon -->
            <div class="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <!-- URL + status -->
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-ink text-sm truncate max-w-md">{webhook.url}</span>
                {#if webhook.isActive}
                  <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">{$_('webhooks.active')}</span>
                {:else}
                  <span class="text-xs px-2 py-0.5 bg-surface-2 text-ink-muted rounded-full font-medium">{$_('webhooks.inactive')}</span>
                {/if}
              </div>

              <!-- Events -->
              <div class="flex items-center gap-1.5 mt-2 flex-wrap">
                {#each webhook.events as event}
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium {eventColors[event] ?? 'bg-surface-2 text-ink-muted'}">
                    {$_(`webhooks.events.${event}`)}
                  </span>
                {/each}
              </div>

              <!-- Secret -->
              <div class="flex items-center gap-2 mt-2.5">
                <span class="text-xs text-ink-subtle">{$_('webhooks.secret')}:</span>
                <code class="text-xs font-mono text-ink-muted bg-surface-2 px-2 py-0.5 rounded">
                  {visibleSecrets[webhook.id] ? webhook.secret : maskSecret(webhook.secret)}
                </code>
                <button
                  on:click={() => toggleSecretVisibility(webhook.id)}
                  class="text-ink-subtle hover:text-gray-600 transition-colors cursor-pointer"
                  title={visibleSecrets[webhook.id] ? $_('webhooks.hideSecret') : $_('webhooks.showSecret')}
                >
                  {#if visibleSecrets[webhook.id]}
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  {:else}
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  {/if}
                </button>
                <button
                  on:click={() => copySecret(webhook.secret, webhook.id)}
                  class="text-ink-subtle hover:text-gray-600 transition-colors cursor-pointer"
                  title={$_('webhooks.copySecret')}
                >
                  {#if copiedId === webhook.id}
                    <svg class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                  {:else}
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  {/if}
                </button>
              </div>

              <!-- Last triggered -->
              <div class="mt-2">
                <span class="text-xs text-ink-subtle">
                  {$_('webhooks.lastTriggered')}: {formatDate(webhook.lastTriggeredAt)}
                </span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 shrink-0">
              <!-- Toggle -->
              <button
                on:click={() => toggleActive(webhook)}
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer {webhook.isActive ? 'bg-indigo-600' : 'bg-gray-200'}"
                title={webhook.isActive ? $_('webhooks.deactivate') : $_('webhooks.activate')}
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-surface transition-transform shadow-sm {webhook.isActive ? 'translate-x-6' : 'translate-x-1'}"
                ></span>
              </button>

              <!-- Edit -->
              <button
                on:click={() => openEditModal(webhook)}
                class="text-xs text-ink-muted border border-border px-3 py-1.5 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                {$_('common.edit')}
              </button>

              <!-- Delete -->
              <button
                on:click={() => (deletingId = webhook.id)}
                class="text-xs text-red-600 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                {$_('common.delete')}
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Add / Edit Webhook Modal -->
{#if showModal}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    on:click|self={() => (showModal = false)}
    on:keydown={(e) => e.key === 'Escape' && (showModal = false)}
  >
    <div class="bg-surface rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-semibold text-ink">
            {editingId ? $_('webhooks.editWebhook') : $_('webhooks.addWebhook')}
          </h2>
          <button
            on:click={() => (showModal = false)}
            class="text-ink-subtle hover:text-gray-600 transition-colors cursor-pointer"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {#if modalError}
          <div class="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{modalError}</div>
        {/if}

        <form on:submit|preventDefault={saveWebhook} class="space-y-4">
          <!-- URL -->
          <div>
            <label class="block text-sm font-medium text-ink mb-1">{$_('webhooks.endpointUrl')} *</label>
            <input
              type="url"
              bind:value={form.url}
              required
              placeholder="https://example.com/webhook"
              class="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p class="text-xs text-ink-subtle mt-1">{$_('webhooks.urlHint')}</p>
          </div>

          <!-- Events -->
          <div>
            <label class="block text-sm font-medium text-ink mb-2">{$_('webhooks.selectEvents')} *</label>
            <div class="space-y-2">
              {#each AVAILABLE_EVENTS as event}
                <label class="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-surface-2 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.events.includes(event)}
                    on:change={() => toggleEvent(event)}
                    class="w-4 h-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
                  />
                  <div class="flex-1">
                    <span class="text-sm text-ink font-medium">{$_(`webhooks.events.${event}`)}</span>
                    <p class="text-xs text-ink-subtle">{$_(`webhooks.eventDescs.${event}`)}</p>
                  </div>
                  <span class="text-xs px-2 py-0.5 rounded-full {eventColors[event] ?? 'bg-surface-2 text-ink-muted'}">
                    {event}
                  </span>
                </label>
              {/each}
            </div>
          </div>

          <div class="flex gap-3 pt-2">
            <button
              type="button"
              on:click={() => (showModal = false)}
              class="flex-1 border border-border text-ink text-sm font-medium py-2.5 rounded-xl hover:bg-surface-2 transition-colors cursor-pointer"
            >
              {$_('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || !form.url || form.events.length === 0}
              class="flex-1 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {saving ? $_('common.loading') : editingId ? $_('common.save') : $_('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if deletingId}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => (deletingId = null)}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <div class="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <h2 class="text-lg font-semibold text-ink mb-1">{$_('webhooks.deleteConfirm')}</h2>
      <p class="text-sm text-ink-muted mb-6">{$_('webhooks.deleteDesc')}</p>
      <div class="flex gap-3">
        <button
          on:click={() => deleteWebhook(deletingId)}
          class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors duration-150 text-sm cursor-pointer"
        >
          {$_('common.delete')}
        </button>
        <button
          on:click={() => (deletingId = null)}
          class="flex-1 px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
