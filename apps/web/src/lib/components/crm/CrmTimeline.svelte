<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { tasksApi, type TimelineItem } from '$lib/api/crm-tasks';
  import { loadActiveMembers, ownerName, type TeamMember } from '$lib/api/crm-owners';
  import { organizationIdStore } from '$lib/stores/projects';

  export let projectId: string;
  export let contactId: string | undefined = undefined;
  export let dealId: string | undefined = undefined;

  let items: TimelineItem[] = [];
  let loading = true;
  let mounted = false;
  let prevWatchKey = '';
  let members: TeamMember[] = [];

  // Toast
  let toast: { message: string; type: 'success' | 'error' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message, type };
    toastTimer = setTimeout(() => { toast = null; }, 5000);
  }

  $: watchKey = `${projectId}:${contactId ?? ''}:${dealId ?? ''}`;

  async function load() {
    if (!projectId) return;
    loading = true;
    try {
      items = await tasksApi.timeline(projectId, { contactId, dealId });
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      loading = false;
    }
  }

  // Log activity modal
  let showLogModal = false;
  let logForm: { type: 'NOTE' | 'CALL' | 'EMAIL' | 'MEETING'; body: string; occurredAt: string } = {
    type: 'NOTE',
    body: '',
    occurredAt: '',
  };
  let logging = false;

  async function logActivity() {
    if (!logForm.body.trim()) return;
    logging = true;
    try {
      await tasksApi.createActivity(projectId, {
        type: logForm.type,
        body: logForm.body.trim(),
        ...(logForm.occurredAt ? { occurredAt: new Date(logForm.occurredAt).toISOString() } : {}),
        ...(contactId ? { contactId } : {}),
        ...(dealId ? { dealId } : {}),
      });
      logForm = { type: 'NOTE', body: '', occurredAt: '' };
      showLogModal = false;
      showToast($_('crm.timeline.logActivitySuccess'), 'success');
      await load();
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      logging = false;
    }
  }

  // Add task modal
  let showAddTaskModal = false;
  let addForm = { title: '', dueDate: '', ownerId: '' };
  let adding = false;

  async function addTask() {
    if (!addForm.title.trim()) return;
    adding = true;
    try {
      await tasksApi.createTask(projectId, {
        title: addForm.title.trim(),
        ...(addForm.dueDate ? { dueDate: new Date(addForm.dueDate).toISOString() } : {}),
        ...(addForm.ownerId ? { ownerId: addForm.ownerId } : {}),
        ...(contactId ? { contactId } : {}),
        ...(dealId ? { dealId } : {}),
      });
      addForm = { title: '', dueDate: '', ownerId: '' };
      showAddTaskModal = false;
      showToast($_('crm.tasks.addSuccess'), 'success');
      await load();
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      adding = false;
    }
  }

  async function completeTask(id: string) {
    try {
      await tasksApi.completeTask(projectId, id);
      showToast($_('crm.tasks.completeSuccess'), 'success');
      await load();
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString($locale ?? 'en', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function handleLogModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showLogModal = false;
  }

  function handleAddTaskModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showAddTaskModal = false;
  }

  onMount(() => {
    mounted = true;
    prevWatchKey = watchKey;
    load();
    if ($organizationIdStore) {
      loadActiveMembers($organizationIdStore).then((m) => { members = m; });
    }
  });

  // Guarded watcher: reload when projectId/contactId/dealId change
  $: if (mounted && watchKey && watchKey !== prevWatchKey) {
    prevWatchKey = watchKey;
    load();
  }
</script>

<div class="bg-surface rounded-xl border border-border">
  <!-- Section header + actions -->
  <div class="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
    <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">
      {$_('crm.timeline.heading')}
    </h2>
    <div class="flex items-center gap-2">
      <button
        on:click={() => (showLogModal = true)}
        class="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 font-medium text-ink-muted hover:text-ink flex items-center gap-1.5 cursor-pointer"
      >
        <!-- Pencil icon -->
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
        </svg>
        {$_('crm.activities.log')}
      </button>
      <button
        on:click={() => (showAddTaskModal = true)}
        class="text-xs px-3 py-1.5 bg-brand text-white rounded-lg hover:brightness-110 transition-colors duration-150 font-medium flex items-center gap-1.5 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('crm.tasks.add')}
      </button>
    </div>
  </div>

  <!-- Timeline body -->
  <div class="p-5">
    {#if loading}
      <div class="space-y-3">
        {#each Array(3) as _}
          <div class="flex gap-3 animate-pulse">
            <div class="w-7 h-7 bg-surface-2 rounded-full flex-shrink-0 mt-0.5"></div>
            <div class="flex-1 space-y-2 py-0.5">
              <div class="h-3.5 bg-surface-2 rounded w-3/4"></div>
              <div class="h-3 bg-surface-2 rounded w-1/3"></div>
            </div>
          </div>
        {/each}
      </div>

    {:else if items.length === 0}
      <div class="py-10 flex flex-col items-center justify-center text-center">
        <div class="w-12 h-12 bg-surface-2 rounded-xl flex items-center justify-center mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <p class="text-sm text-ink-muted">{$_('crm.timeline.empty')}</p>
      </div>

    {:else}
      <ol class="relative space-y-4">
        {#each items as item (item.id)}
          {@const isActivity = item.kind === 'activity'}
          {@const isTask = item.kind === 'task'}
          {@const taskDone = isTask && item.data?.status === 'DONE'}
          <li class="flex gap-3">
            <!-- Icon -->
            <div class="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5
              {isActivity
                ? item.data?.type === 'CALL'
                  ? 'bg-green-500/10 text-green-600'
                  : item.data?.type === 'EMAIL'
                    ? 'bg-blue-500/10 text-blue-600'
                    : item.data?.type === 'MEETING'
                      ? 'bg-purple-500/10 text-purple-600'
                      : 'bg-ink-subtle/10 text-ink-muted'
                : taskDone
                  ? 'bg-green-500/10 text-green-600'
                  : 'bg-brand-subtle/10 text-brand'}"
            >
              {#if isActivity}
                {#if item.data?.type === 'CALL'}
                  <!-- Phone icon -->
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                  </svg>
                {:else if item.data?.type === 'EMAIL'}
                  <!-- Envelope icon -->
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                {:else if item.data?.type === 'MEETING'}
                  <!-- Calendar icon -->
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                {:else}
                  <!-- Note/pencil icon -->
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                  </svg>
                {/if}
              {:else}
                <!-- Task icon -->
                {#if taskDone}
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                {:else}
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                {/if}
              {/if}
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              {#if isActivity}
                <div class="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <span class="text-xs font-semibold text-ink">
                    {$_(`crm.activities.types.${item.data?.type}`, { default: item.data?.type ?? '' })}
                  </span>
                  {#if item.data?.owner?.name}
                    <span class="text-xs text-ink-muted">·</span>
                    <span class="text-xs text-ink-muted">{item.data.owner.name}</span>
                  {:else if item.data?.ownerId}
                    <span class="text-xs text-ink-muted">·</span>
                    <span class="text-xs text-ink-muted">{ownerName(members, item.data.ownerId, $_('crm.unassigned'))}</span>
                  {/if}
                  <span class="text-xs text-ink-subtle ml-auto">{formatDate(item.date)}</span>
                </div>
                {#if item.data?.body}
                  <p class="text-sm text-ink leading-snug whitespace-pre-wrap">{item.data.body}</p>
                {/if}

              {:else if isTask}
                <div class="flex items-start gap-2">
                  <!-- Complete button (only for open tasks) -->
                  {#if !taskDone}
                    <button
                      on:click={() => completeTask(item.id)}
                      title={$_('crm.tasks.complete')}
                      aria-label={$_('crm.tasks.complete')}
                      class="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 border-border hover:border-brand hover:bg-brand/10 transition-colors duration-150 cursor-pointer"
                    ></button>
                  {/if}
                  <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span class="text-sm font-medium text-ink {taskDone ? 'line-through text-ink-muted' : ''}">
                        {item.data?.title ?? ''}
                      </span>
                      <span class="text-xs text-ink-subtle ml-auto">{formatDate(item.date)}</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {#if item.data?.owner?.name}
                        <span class="text-xs text-ink-muted">{item.data.owner.name}</span>
                      {:else if item.data?.ownerId}
                        <span class="text-xs text-ink-muted">{ownerName(members, item.data.ownerId, $_('crm.unassigned'))}</span>
                      {/if}
                      {#if item.data?.dueDate && item.data?.dueDate !== item.date}
                        <span class="text-xs text-ink-subtle">
                          {$_('crm.tasks.due', { values: { date: formatDate(item.data.dueDate) } })}
                        </span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</div>

<!-- Toast notification -->
{#if toast}
  <div class="fixed bottom-6 right-6 z-[60] max-w-sm">
    <div class="flex items-start gap-3 rounded-xl shadow-lg border px-4 py-3 text-sm
      {toast.type === 'success' ? 'bg-green-500/12 border-green-500/30 text-green-800' : 'bg-red-500/12 border-red-500/30 text-red-800'}">
      {#if toast.type === 'success'}
        <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 w-4 h-4 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      {/if}
      <span>{toast.message}</span>
      <button
        on:click={() => (toast = null)}
        aria-label={$_('common.close')}
        class="ml-auto flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<!-- Log Activity Modal -->
{#if showLogModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    on:click|self={() => (showLogModal = false)}
    on:keydown={handleLogModalKeydown}
  >
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
      <div class="p-6 border-b border-border flex items-center gap-2.5">
        <div class="w-8 h-8 bg-brand-subtle/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('crm.activities.log')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <!-- Type -->
        <div>
          <label for="log-type" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.activities.type')}
          </label>
          <select
            id="log-type"
            bind:value={logForm.type}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink cursor-pointer"
          >
            <option value="NOTE">{$_('crm.activities.types.NOTE')}</option>
            <option value="CALL">{$_('crm.activities.types.CALL')}</option>
            <option value="EMAIL">{$_('crm.activities.types.EMAIL')}</option>
            <option value="MEETING">{$_('crm.activities.types.MEETING')}</option>
          </select>
        </div>

        <!-- Body -->
        <div>
          <label for="log-body" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.activities.body')}
          </label>
          <textarea
            id="log-body"
            rows="4"
            bind:value={logForm.body}
            placeholder={$_('crm.activities.bodyPlaceholder')}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink resize-none"
          ></textarea>
        </div>

        <!-- Occurred at (optional) -->
        <div>
          <label for="log-occurred" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.activities.occurredAt')}
            <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
          </label>
          <input
            id="log-occurred"
            type="date"
            bind:value={logForm.occurredAt}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink cursor-pointer"
          />
        </div>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={logActivity}
          disabled={logging || !logForm.body.trim()}
          class="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if logging}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('common.loading')}
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
            {$_('crm.activities.log')}
          {/if}
        </button>
        <button
          on:click={() => (showLogModal = false)}
          class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Add Task Modal -->
{#if showAddTaskModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    on:click|self={() => (showAddTaskModal = false)}
    on:keydown={handleAddTaskModalKeydown}
  >
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
      <div class="p-6 border-b border-border flex items-center gap-2.5">
        <div class="w-8 h-8 bg-brand-subtle/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('crm.tasks.add')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <!-- Title -->
        <div>
          <label for="tl-task-title" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.tasks.form.title')}
          </label>
          <input
            id="tl-task-title"
            type="text"
            bind:value={addForm.title}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
          />
        </div>

        <!-- Due date -->
        <div>
          <label for="tl-task-due" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.tasks.form.dueDate')}
            <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
          </label>
          <input
            id="tl-task-due"
            type="date"
            bind:value={addForm.dueDate}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink cursor-pointer"
          />
        </div>

        <!-- Owner -->
        <div>
          <label for="tl-task-owner" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.tasks.form.owner')}
          </label>
          <select
            id="tl-task-owner"
            bind:value={addForm.ownerId}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink cursor-pointer"
          >
            <option value="">{$_('crm.unassigned')}</option>
            {#each members as m (m.userId)}
              <option value={m.userId}>{m.name}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={addTask}
          disabled={adding || !addForm.title.trim()}
          class="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if adding}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('common.loading')}
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {$_('crm.tasks.add')}
          {/if}
        </button>
        <button
          on:click={() => (showAddTaskModal = false)}
          class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
