<script lang="ts">
  import { page } from '$app/stores';
  import { _, locale } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { tasksApi, type CrmTask } from '$lib/api/crm-tasks';
  import { taskBucket } from '$lib/api/crm-tasks-bucket';
  import { crmApi, type CrmContact } from '$lib/api/crm';
  import { dealsApi, type Deal } from '$lib/api/crm-deals';
  import { contactDisplayName } from '$lib/api/crm-display';
  import { loadActiveMembers, ownerName, type TeamMember } from '$lib/api/crm-owners';
  import { organizationIdStore } from '$lib/stores/projects';
  import { currentUser } from '$stores/auth';

  $: projectId = $page.params['id'];

  let tasks: CrmTask[] = [];
  let loading = false;
  let mounted = false;
  let prevProjectId = '';
  let myTasksOnly = false;

  // Data for selectors
  let members: TeamMember[] = [];
  let contacts: CrmContact[] = [];
  let deals: Deal[] = [];

  // Toast
  let toast: { message: string; type: 'success' | 'error' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message, type };
    toastTimer = setTimeout(() => { toast = null; }, 5000);
  }

  async function load() {
    if (!projectId) return;
    loading = true;
    try {
      tasks = await tasksApi.listTasks(projectId, { status: 'OPEN' });
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      loading = false;
    }
  }

  // Client-side bucket + "my tasks" filter (instantaneous, no extra API round-trip)
  $: now = new Date();
  $: filteredTasks = myTasksOnly && $currentUser?.id
    ? tasks.filter((t) => t.ownerId === $currentUser!.id)
    : tasks;
  $: overdueTasks = filteredTasks.filter((t) => taskBucket(t.dueDate, now) === 'overdue');
  $: todayTasks = filteredTasks.filter((t) => taskBucket(t.dueDate, now) === 'today');
  $: upcomingTasks = filteredTasks.filter((t) => taskBucket(t.dueDate, now) === 'upcoming');

  function formatDueDate(iso: string): string {
    return new Date(iso).toLocaleDateString($locale ?? 'en', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  async function complete(id: string) {
    try {
      await tasksApi.completeTask(projectId, id);
      showToast($_('crm.tasks.completeSuccess'), 'success');
      await load();
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    }
  }

  // Add task modal
  let showAddModal = false;
  let addForm = { title: '', description: '', dueDate: '', ownerId: '', contactId: '', dealId: '' };
  let adding = false;

  async function openAddModal() {
    showAddModal = true;
    if (contacts.length === 0) {
      try {
        const res = await crmApi.listContacts(projectId, { pageSize: 100 });
        contacts = res.items;
      } catch { contacts = []; }
    }
    if (deals.length === 0) {
      try {
        deals = await dealsApi.listDeals(projectId, { status: 'OPEN' });
      } catch { deals = []; }
    }
  }

  async function addTask() {
    if (!addForm.title.trim()) return;
    adding = true;
    try {
      await tasksApi.createTask(projectId, {
        title: addForm.title.trim(),
        description: addForm.description.trim() || undefined,
        dueDate: addForm.dueDate ? new Date(addForm.dueDate).toISOString() : undefined,
        ownerId: addForm.ownerId || undefined,
        contactId: addForm.contactId || undefined,
        dealId: addForm.dealId || undefined,
      });
      addForm = { title: '', description: '', dueDate: '', ownerId: '', contactId: '', dealId: '' };
      showAddModal = false;
      showToast($_('crm.tasks.addSuccess'), 'success');
      await load();
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      adding = false;
    }
  }

  function handleAddModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showAddModal = false;
  }

  onMount(() => {
    mounted = true;
    prevProjectId = projectId;
    load();
    if ($organizationIdStore) {
      loadActiveMembers($organizationIdStore).then((m) => { members = m; });
    }
  });

  // Project-switch safe refetch (route is reused across [id] changes)
  $: if (mounted && projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    load();
  }
</script>

<div class="p-4 sm:p-6">
  <!-- CRM sub-navigation: Contacts | Companies | Deals | Tasks -->
  <div class="flex items-center gap-1 mb-6 p-1 bg-surface-2 rounded-lg w-fit">
    <a
      href="/projects/{projectId}/crm/contacts"
      class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors text-ink-muted hover:text-ink"
    >
      {$_('crm.nav.contacts')}
    </a>
    <a
      href="/projects/{projectId}/crm/companies"
      class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors text-ink-muted hover:text-ink"
    >
      {$_('crm.nav.companies')}
    </a>
    <a
      href="/projects/{projectId}/crm/deals"
      class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors text-ink-muted hover:text-ink"
    >
      {$_('crm.nav.deals')}
    </a>
    <a
      href="/projects/{projectId}/crm/tasks"
      class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors bg-surface text-ink shadow-sm"
      aria-current="page"
    >
      {$_('crm.nav.tasks')}
    </a>
  </div>

  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
    <h1 class="text-2xl font-bold text-ink">{$_('crm.tasks.title')}</h1>
    <div class="flex items-center gap-3">
      <!-- My tasks toggle -->
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          bind:checked={myTasksOnly}
          class="w-4 h-4 rounded border-border text-brand focus:ring-brand cursor-pointer"
        />
        <span class="text-sm text-ink-muted">{$_('crm.tasks.myTasks')}</span>
      </label>

      <button
        on:click={openAddModal}
        class="bg-brand text-white px-3 py-2 rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('crm.tasks.add')}
      </button>
    </div>
  </div>

  {#if loading}
    <!-- Loading skeleton -->
    <div class="space-y-6">
      {#each Array(2) as _}
        <div>
          <div class="h-4 bg-surface-2 rounded w-24 mb-3 animate-pulse"></div>
          <div class="space-y-2">
            {#each Array(3) as __}
              <div class="bg-surface rounded-xl border border-border p-4 animate-pulse">
                <div class="h-4 bg-surface-2 rounded w-2/3 mb-2"></div>
                <div class="h-3 bg-surface-2 rounded w-1/3"></div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

  {:else if filteredTasks.length === 0}
    <!-- Empty state -->
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-20 h-20 bg-brand-subtle/10 rounded-2xl flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-ink mb-2">{$_('crm.tasks.empty')}</h2>
      <button
        on:click={openAddModal}
        class="mt-4 bg-brand text-white px-6 py-3 rounded-xl font-medium hover:brightness-110 transition-colors duration-150 flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('crm.tasks.add')}
      </button>
    </div>

  {:else}
    <div class="space-y-8">
      <!-- Overdue group -->
      {#if overdueTasks.length > 0}
        <section>
          <h2 class="text-xs font-semibold text-red-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {$_('crm.tasks.overdue')}
          </h2>
          <div class="space-y-2">
            {#each overdueTasks as task (task.id)}
              <div class="bg-surface rounded-xl border border-red-200 p-4 flex items-start gap-3">
                <!-- Complete checkbox -->
                <button
                  on:click={() => complete(task.id)}
                  title={$_('crm.tasks.complete')}
                  class="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 border-red-400 hover:border-brand hover:bg-brand/10 transition-colors duration-150 cursor-pointer"
                  aria-label={$_('crm.tasks.complete')}
                ></button>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-ink">{task.title}</p>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                    {#if task.dueDate}
                      <span class="text-xs text-red-600">
                        {$_('crm.tasks.due', { values: { date: formatDueDate(task.dueDate) } })}
                      </span>
                    {:else}
                      <span class="text-xs text-ink-subtle">{$_('crm.tasks.noDue')}</span>
                    {/if}
                    {#if task.ownerId}
                      <span class="text-xs text-ink-muted">{ownerName(members, task.ownerId, $_('crm.unassigned'))}</span>
                    {/if}
                    {#if task.contact}
                      <span class="text-xs text-ink-subtle">
                        {contactDisplayName(task.contact, task.contact.id)}
                      </span>
                    {/if}
                    {#if task.deal}
                      <span class="text-xs text-ink-subtle">{task.deal.title}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Today group -->
      {#if todayTasks.length > 0}
        <section>
          <h2 class="text-xs font-semibold text-brand uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            {$_('crm.tasks.today')}
          </h2>
          <div class="space-y-2">
            {#each todayTasks as task (task.id)}
              <div class="bg-surface rounded-xl border border-border p-4 flex items-start gap-3">
                <button
                  on:click={() => complete(task.id)}
                  title={$_('crm.tasks.complete')}
                  class="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 border-border hover:border-brand hover:bg-brand/10 transition-colors duration-150 cursor-pointer"
                  aria-label={$_('crm.tasks.complete')}
                ></button>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-ink">{task.title}</p>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                    {#if task.dueDate}
                      <span class="text-xs text-ink-muted">
                        {$_('crm.tasks.due', { values: { date: formatDueDate(task.dueDate) } })}
                      </span>
                    {:else}
                      <span class="text-xs text-ink-subtle">{$_('crm.tasks.noDue')}</span>
                    {/if}
                    {#if task.ownerId}
                      <span class="text-xs text-ink-muted">{ownerName(members, task.ownerId, $_('crm.unassigned'))}</span>
                    {/if}
                    {#if task.contact}
                      <span class="text-xs text-ink-subtle">
                        {contactDisplayName(task.contact, task.contact.id)}
                      </span>
                    {/if}
                    {#if task.deal}
                      <span class="text-xs text-ink-subtle">{task.deal.title}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Upcoming group -->
      {#if upcomingTasks.length > 0}
        <section>
          <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            {$_('crm.tasks.upcoming')}
          </h2>
          <div class="space-y-2">
            {#each upcomingTasks as task (task.id)}
              <div class="bg-surface rounded-xl border border-border p-4 flex items-start gap-3">
                <button
                  on:click={() => complete(task.id)}
                  title={$_('crm.tasks.complete')}
                  class="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 border-border hover:border-brand hover:bg-brand/10 transition-colors duration-150 cursor-pointer"
                  aria-label={$_('crm.tasks.complete')}
                ></button>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-ink">{task.title}</p>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                    {#if task.dueDate}
                      <span class="text-xs text-ink-muted">
                        {$_('crm.tasks.due', { values: { date: formatDueDate(task.dueDate) } })}
                      </span>
                    {:else}
                      <span class="text-xs text-ink-subtle">{$_('crm.tasks.noDue')}</span>
                    {/if}
                    {#if task.ownerId}
                      <span class="text-xs text-ink-muted">{ownerName(members, task.ownerId, $_('crm.unassigned'))}</span>
                    {/if}
                    {#if task.contact}
                      <span class="text-xs text-ink-subtle">
                        {contactDisplayName(task.contact, task.contact.id)}
                      </span>
                    {/if}
                    {#if task.deal}
                      <span class="text-xs text-ink-subtle">{task.deal.title}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {/if}
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
        class="ml-auto flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<!-- Add Task Modal -->
{#if showAddModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    on:click|self={() => (showAddModal = false)}
    on:keydown={handleAddModalKeydown}
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
          <label for="task-title" class="block text-sm font-medium text-ink mb-1.5">{$_('crm.tasks.form.title')}</label>
          <input
            id="task-title"
            type="text"
            bind:value={addForm.title}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
            placeholder={$_('crm.tasks.form.titlePlaceholder')}
          />
        </div>

        <!-- Description -->
        <div>
          <label for="task-desc" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.tasks.form.description')}
            <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
          </label>
          <textarea
            id="task-desc"
            rows="2"
            bind:value={addForm.description}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink resize-none"
            placeholder={$_('crm.tasks.form.descriptionPlaceholder')}
          ></textarea>
        </div>

        <!-- Due date -->
        <div>
          <label for="task-due" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.tasks.form.dueDate')}
            <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
          </label>
          <input
            id="task-due"
            type="date"
            bind:value={addForm.dueDate}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
          />
        </div>

        <!-- Owner -->
        <div>
          <label for="task-owner" class="block text-sm font-medium text-ink mb-1.5">{$_('crm.tasks.form.owner')}</label>
          <select
            id="task-owner"
            bind:value={addForm.ownerId}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
          >
            <option value="">{$_('crm.unassigned')}</option>
            {#each members as m (m.userId)}
              <option value={m.userId}>{m.name}</option>
            {/each}
          </select>
        </div>

        <!-- Contact -->
        <div>
          <label for="task-contact" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.deals.contact')}
            <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
          </label>
          <select
            id="task-contact"
            bind:value={addForm.contactId}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
          >
            <option value="">{$_('crm.none')}</option>
            {#each contacts as c (c.id)}
              <option value={c.id}>{contactDisplayName(c, c.id)}</option>
            {/each}
          </select>
        </div>

        <!-- Deal -->
        <div>
          <label for="task-deal" class="block text-sm font-medium text-ink mb-1.5">
            {$_('crm.deals.title')}
            <span class="font-normal text-ink-subtle text-xs ml-1">— {$_('common.optional')}</span>
          </label>
          <select
            id="task-deal"
            bind:value={addForm.dealId}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-ink"
          >
            <option value="">{$_('crm.none')}</option>
            {#each deals as d (d.id)}
              <option value={d.id}>{d.title}</option>
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
          on:click={() => (showAddModal = false)}
          class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
