<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { API_URL } from '$lib/config';
  import { marked } from 'marked';
  import SectionHint from '$lib/components/SectionHint.svelte';
  import { currentProjectStore, projectsStore } from '$lib/stores/projects';

  marked.setOptions({ breaks: true, gfm: true });

  function renderMarkdown(text: string): string {
    // Strip ```markdown wrapper if AI agent wrapped the entire content
    let cleaned = text.trim();
    if (cleaned.startsWith('```markdown')) {
      cleaned = cleaned.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '');
    } else if (cleaned.startsWith('```md')) {
      cleaned = cleaned.replace(/^```md\s*\n?/, '').replace(/\n?```\s*$/, '');
    } else if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return marked.parse(cleaned, { async: false }) as string;
  }

  let documents: any[] = [];
  let loading = true;
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

  async function reloadForProject() {
    loading = true;
    documents = [];
    viewingDocument = null;
    try {
      documents = await api.get<any[]>('/documents', { projectId });
    } finally {
      loading = false;
    }
  }

  // AI generation
  let showGenerateModal = false;
  let generating = false;
  let generateForm = { type: 'MARKETING_PLAN', title: '' };
  let lastTraceUrl: string | null = null;

  // Manual creation
  let showCreateModal = false;
  let creating = false;
  let createForm = { type: '', title: '', contentMd: '' };

  // Upload
  let showUploadModal = false;
  let uploading = false;
  let uploadFile: File | null = null;
  let uploadForm = { type: '', title: '' };
  let dragOver = false;

  // View
  let viewingDocument: any = null;

  // Edit
  let editingDocument: any = null;
  let editForm = { title: '', contentMd: '', type: '' };
  let editSaving = false;

  // Delete
  let deletingId: string | null = null;

  // Dynamic document types (loaded from API)
  let docTypes: { id: string; slug: string; label: string; isDefault: boolean; sortOrder: number }[] = [];

  // Manage types modal
  let showManageTypesModal = false;
  let newTypeLabel = '';
  let addingType = false;
  let deletingTypeId: string | null = null;

  function getTypeLabel(slug: string | null | undefined): string {
    if (!slug) return $_('documents.noType');
    const found = docTypes.find(t => t.slug === slug);
    return found ? found.label : slug;
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function isImageMime(mime: string): boolean {
    return mime?.startsWith('image/');
  }

  onMount(async () => {
    const [docs, types] = await Promise.all([
      api.get<any[]>('/documents', { projectId }),
      api.get<any[]>('/documents/types'),
    ]);
    documents = docs;
    docTypes = types;
    loading = false;
    prevProjectId = projectId;
    mounted = true;
  });

  // --- AI Generation with polling ---
  async function generateDocument() {
    generating = true;
    lastTraceUrl = null;
    try {
      const run = await api.post<{ id: string; status: string }>('/agent/run', {
        projectId,
        agentType: 'DOCUMENT',
        input: { type: generateForm.type, title: generateForm.title || undefined, language: $locale },
      });

      let finalRun: { status: string; error?: string; langsmithTraceUrl?: string | null } = run;
      const startTime = Date.now();
      while (finalRun.status === 'PENDING' || finalRun.status === 'RUNNING') {
        if (Date.now() - startTime > 90000) break;
        await new Promise(r => setTimeout(r, 2000));
        finalRun = await api.get<{ status: string; error?: string; langsmithTraceUrl?: string | null }>(`/agent/runs/${run.id}`);
      }

      if (finalRun.status === 'FAILED') {
        throw new Error(finalRun.error || 'Document generation failed');
      }

      lastTraceUrl = finalRun.langsmithTraceUrl ?? null;
      documents = await api.get<any[]>('/documents', { projectId });
      showGenerateModal = false;
      generateForm = { type: 'MARKETING_PLAN', title: '' };
    } catch (e: any) {
      alert(e.message);
    } finally {
      generating = false;
    }
  }

  // --- Manual creation ---
  async function createDocument() {
    if (!createForm.title.trim()) return;
    creating = true;
    try {
      const doc = await api.post<any>('/documents', {
        projectId,
        type: createForm.type || undefined,
        title: createForm.title,
        contentMd: createForm.contentMd || undefined,
        generatedByAi: false,
      });
      documents = [doc, ...documents];
      showCreateModal = false;
      createForm = { type: '', title: '', contentMd: '' };
    } catch (e: any) {
      alert(e.message);
    } finally {
      creating = false;
    }
  }

  // --- Upload ---
  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
      uploadFile = input.files[0];
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files?.length) {
      uploadFile = e.dataTransfer.files[0];
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  async function uploadDocument() {
    if (!uploadFile) return;
    if (uploadFile.size > MAX_FILE_SIZE) {
      alert($_('documents.maxFileSize'));
      return;
    }
    uploading = true;
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('projectId', projectId);
      if (uploadForm.type) {
        formData.append('type', uploadForm.type);
      }
      if (uploadForm.title.trim()) {
        formData.append('title', uploadForm.title);
      }
      const doc = await api.upload<any>('/documents/upload', formData);
      documents = [doc, ...documents];
      showUploadModal = false;
      uploadFile = null;
      uploadForm = { type: '', title: '' };
    } catch (e: any) {
      alert(e.message);
    } finally {
      uploading = false;
    }
  }

  // --- View ---
  function openView(doc: any) {
    viewingDocument = doc;
  }

  // --- Edit ---
  function openEdit(doc: any) {
    editingDocument = doc;
    editForm = { title: doc.title, contentMd: doc.contentMd || '', type: doc.type || '' };
    viewingDocument = null;
  }

  async function saveEdit() {
    if (!editingDocument) return;
    editSaving = true;
    try {
      const updated = await api.put<any>(`/documents/${editingDocument.id}`, {
        title: editForm.title,
        contentMd: editForm.contentMd,
        type: editForm.type || null,
      });
      documents = documents.map(d => d.id === updated.id ? { ...d, ...updated } : d);
      editingDocument = null;
    } catch (e: any) {
      alert(e.message);
    } finally {
      editSaving = false;
    }
  }

  // --- Download ---
  function sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'document';
  }

  function downloadMarkdown(doc: any) {
    const filename = `${sanitizeFilename(doc.title)}.md`;
    const blob = new Blob([doc.contentMd || ''], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- Delete ---
  async function deleteDocument(id: string) {
    try {
      await api.delete(`/documents/${id}`);
      documents = documents.filter(d => d.id !== id);
      if (viewingDocument?.id === id) viewingDocument = null;
    } catch (e: any) {
      alert(e.message);
    } finally {
      deletingId = null;
    }
  }

  // --- Manage Types ---
  async function addDocumentType() {
    if (!newTypeLabel.trim()) return;
    addingType = true;
    try {
      const created = await api.post<any>('/documents/types', { label: newTypeLabel.trim() });
      docTypes = [...docTypes, created];
      newTypeLabel = '';
    } catch (e: any) {
      alert(e.message);
    } finally {
      addingType = false;
    }
  }

  async function removeDocumentType(id: string) {
    try {
      await api.delete(`/documents/types/${id}`);
      docTypes = docTypes.filter(t => t.id !== id);
    } catch (e: any) {
      alert(e.message);
    } finally {
      deletingTypeId = null;
    }
  }

  function isTypeInUse(slug: string): boolean {
    return documents.some(d => d.type === slug);
  }
</script>

<div class="p-4 sm:p-6">
  <SectionHint sectionKey="documents" titleKey="hints.documents.title" descKey="hints.documents.desc" />
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
    <h1 class="text-2xl font-bold text-ink">{$_('documents.title')}</h1>
    <div class="flex items-center gap-2 flex-wrap">
      <button
        on:click={() => showManageTypesModal = true}
        class="border border-border text-ink px-3 sm:px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-2 transition-colors duration-150 flex items-center gap-1.5 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
        <span class="hidden sm:inline">{$_('documents.manageTypes')}</span>
      </button>
      <button
        on:click={() => showCreateModal = true}
        class="border border-border text-ink px-3 sm:px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-2 transition-colors duration-150 flex items-center gap-1.5 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        <span class="hidden sm:inline">{$_('documents.create')}</span>
      </button>
      <button
        on:click={() => { showUploadModal = true; uploadFile = null; uploadForm = { type: '', title: '' }; }}
        class="border border-border text-ink px-3 sm:px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-2 transition-colors duration-150 flex items-center gap-1.5 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
        </svg>
        <span class="hidden sm:inline">{$_('documents.upload')}</span>
      </button>
      <button
        on:click={() => showGenerateModal = true}
        class="bg-brand text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 flex items-center gap-1.5 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
        <span class="hidden sm:inline">{$_('documents.generate')}</span>
        <span class="sm:hidden">AI</span>
      </button>
    </div>
  </div>

  <!-- LangSmith trace banner -->
  {#if lastTraceUrl}
    <div class="mb-4 flex items-center gap-3 px-4 py-3 bg-purple-500/12 border border-purple-500/30 rounded-xl text-sm">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
      </svg>
      <span class="text-purple-700 flex-1">{$_('documents.generated')}</span>
      <a
        href={lastTraceUrl}
        target="_blank"
        rel="noopener noreferrer"
        class="text-purple-600 font-medium hover:text-purple-800 hover:underline flex items-center gap-1"
      >
        LangSmith
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </a>
      <button on:click={() => lastTraceUrl = null} class="text-purple-400 hover:text-purple-600 cursor-pointer ml-1">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  {/if}

  <!-- Loading -->
  {#if loading}
    <div class="space-y-3">
      {#each Array(3) as _}
        <div class="bg-surface rounded-xl border border-border p-5 animate-pulse h-24"></div>
      {/each}
    </div>

  <!-- Empty state -->
  {:else if documents.length === 0}
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-20 h-20 bg-brand-subtle/10 rounded-2xl flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-ink mb-2">{$_('documents.empty')}</h2>
      <p class="text-ink-muted mb-6">{$_('documents.emptyDesc')}</p>
      <div class="flex items-center gap-3">
        <button
          on:click={() => showCreateModal = true}
          class="border border-border text-ink px-5 py-3 rounded-xl font-medium hover:bg-surface-2 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {$_('documents.create')}
        </button>
        <button
          on:click={() => { showUploadModal = true; uploadFile = null; uploadForm = { type: '', title: '' }; }}
          class="border border-border text-ink px-5 py-3 rounded-xl font-medium hover:bg-surface-2 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          {$_('documents.upload')}
        </button>
        <button
          on:click={() => showGenerateModal = true}
          class="bg-brand text-white px-5 py-3 rounded-xl font-medium hover:brightness-110 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
          {$_('documents.generate')}
        </button>
      </div>
    </div>

  <!-- Document list -->
  {:else}
    <div class="space-y-3">
      {#each documents as doc}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="bg-surface rounded-xl border border-border border-l-4 border-l-primary-400 p-5 hover:shadow-sm transition-shadow duration-150 cursor-pointer"
          on:click={() => openView(doc)}
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-4 flex-1 min-w-0">
              <div class="w-10 h-10 rounded-lg bg-brand-subtle/10 flex items-center justify-center flex-shrink-0">
                {#if doc.fileUrl}
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                  </svg>
                {:else}
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-medium text-ink truncate">{doc.title}</h3>
                <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span class="text-xs px-2 py-0.5 bg-surface-2 text-ink-muted rounded font-medium">{getTypeLabel(doc.type)}</span>
                  <span class="text-xs text-ink-subtle">{$_('documents.version')} {doc.version}</span>
                  {#if doc.generatedByAi}
                    <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-purple-500/12 text-purple-600 rounded">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                      </svg>
                      AI
                    </span>
                  {/if}
                  {#if doc.fileUrl}
                    <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-500/12 text-blue-600 rounded">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                      </svg>
                      {$_('documents.upload')}
                    </span>
                  {/if}
                  {#if doc.fileSize}
                    <span class="text-xs text-ink-subtle">{formatFileSize(doc.fileSize)}</span>
                  {/if}
                </div>
                <p class="text-xs text-ink-subtle mt-1">{new Date(doc.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <button
                on:click|stopPropagation={() => openEdit(doc)}
                class="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 cursor-pointer"
              >
                {$_('common.edit')}
              </button>
              <!-- Download button -->
              {#if doc.fileUrl}
                <a
                  href="{API_URL.replace('/api', '')}{doc.fileUrl}"
                  download={doc.fileName || doc.title}
                  on:click|stopPropagation
                  class="text-xs px-2 py-1.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 cursor-pointer inline-flex items-center"
                  title={$_('documents.download')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </a>
              {:else if doc.contentMd}
                <button
                  on:click|stopPropagation={() => downloadMarkdown(doc)}
                  class="text-xs px-2 py-1.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 cursor-pointer"
                  title={$_('documents.download')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </button>
              {/if}
              <!-- Delete button -->
              <button
                on:click|stopPropagation={() => deletingId = doc.id}
                class="text-xs px-2 py-1.5 border border-red-500/30 text-red-500 rounded-lg hover:bg-red-500/12 transition-colors duration-150 cursor-pointer"
                title={$_('documents.deleteDocument')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Generate with AI modal -->
{#if showGenerateModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showGenerateModal = false}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-border flex items-center gap-2.5">
        <div class="w-8 h-8 bg-brand-subtle/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('documents.generate')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="gen-type" class="block text-sm font-medium text-ink mb-1.5">{$_('documents.type')}</label>
          <select id="gen-type" bind:value={generateForm.type} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
            {#each docTypes as t}
              <option value={t.slug}>{t.label}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="gen-title" class="block text-sm font-medium text-ink mb-1.5">{$_('documents.customTitle')} <span class="text-ink-subtle font-normal">({$_('common.optional')})</span></label>
          <input id="gen-title" type="text" bind:value={generateForm.title} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder={$_('documents.customTitlePlaceholder')} />
        </div>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={generateDocument}
          disabled={generating}
          class="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if generating}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('documents.generating')}
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            {$_('documents.generate')}
          {/if}
        </button>
        <button on:click={() => showGenerateModal = false} class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Create document modal -->
{#if showCreateModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showCreateModal = false}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-lg">
      <div class="p-6 border-b border-border flex items-center gap-2.5">
        <div class="w-8 h-8 bg-green-500/12 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('documents.create')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="create-title" class="block text-sm font-medium text-ink mb-1.5">{$_('documents.titleLabel')}</label>
          <input id="create-title" type="text" bind:value={createForm.title} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder={$_('documents.titlePlaceholder')} />
        </div>
        <div>
          <label for="create-type" class="block text-sm font-medium text-ink mb-1.5">{$_('documents.type')} <span class="text-ink-subtle font-normal">({$_('common.optional')})</span></label>
          <select id="create-type" bind:value={createForm.type} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
            <option value="">{$_('documents.noType')}</option>
            {#each docTypes as t}
              <option value={t.slug}>{t.label}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="create-content" class="block text-sm font-medium text-ink mb-1.5">{$_('content.title')} <span class="text-ink-subtle font-normal">({$_('common.optional')})</span></label>
          <textarea
            id="create-content"
            bind:value={createForm.contentMd}
            rows="8"
            class="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            placeholder={$_('documents.contentPlaceholder')}
          ></textarea>
        </div>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={createDocument}
          disabled={creating || !createForm.title.trim()}
          class="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if creating}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          {/if}
          {$_('documents.create')}
        </button>
        <button on:click={() => showCreateModal = false} class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Upload document modal -->
{#if showUploadModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showUploadModal = false}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-border flex items-center gap-2.5">
        <div class="w-8 h-8 bg-blue-500/12 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('documents.uploadDocument')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <!-- Drop zone -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="border-2 border-dashed rounded-xl p-6 text-center transition-colors duration-150 {dragOver ? 'border-primary-400 bg-brand-subtle/10' : 'border-border hover:border-border'}"
          on:drop={handleDrop}
          on:dragover={handleDragOver}
          on:dragleave={handleDragLeave}
        >
          {#if uploadFile}
            <div class="flex items-center gap-3 justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <div class="text-left">
                <p class="text-sm font-medium text-ink truncate max-w-[200px]">{uploadFile.name}</p>
                <p class="text-xs text-ink-muted">{formatFileSize(uploadFile.size)}</p>
              </div>
              <button on:click|stopPropagation={() => uploadFile = null} class="text-ink-subtle hover:text-ink-muted cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-ink-subtle mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <p class="text-sm text-ink-muted mb-1">{$_('documents.dragDrop')}</p>
            <p class="text-xs text-ink-subtle mb-3">{$_('documents.maxFileSize')}</p>
            <label class="inline-flex items-center gap-2 px-4 py-2 bg-brand-subtle/10 text-brand rounded-lg text-sm font-medium cursor-pointer hover:bg-primary-100 transition-colors duration-150">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {$_('documents.selectFile')}
              <input type="file" class="hidden" on:change={handleFileSelect} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.markdown,.png,.jpg,.jpeg,.gif,.webp,.svg" />
            </label>
          {/if}
        </div>

        <div>
          <label for="upload-type" class="block text-sm font-medium text-ink mb-1.5">{$_('documents.type')} <span class="text-ink-subtle font-normal">({$_('common.optional')})</span></label>
          <select id="upload-type" bind:value={uploadForm.type} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
            <option value="">{$_('documents.noType')}</option>
            {#each docTypes as t}
              <option value={t.slug}>{t.label}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="upload-title" class="block text-sm font-medium text-ink mb-1.5">{$_('documents.titleLabel')} <span class="text-ink-subtle font-normal">({$_('common.optional')})</span></label>
          <input id="upload-title" type="text" bind:value={uploadForm.title} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder={$_('documents.titlePlaceholder')} />
        </div>
        <p class="text-xs text-ink-subtle">{$_('documents.allowedTypes')}</p>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={uploadDocument}
          disabled={uploading || !uploadFile}
          class="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if uploading}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('documents.uploading')}
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            {$_('documents.upload')}
          {/if}
        </button>
        <button on:click={() => showUploadModal = false} class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- View document modal -->
{#if viewingDocument}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => viewingDocument = null}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
      <div class="p-6 border-b border-border flex items-start justify-between flex-shrink-0">
        <div class="flex items-start gap-3 flex-1 min-w-0">
          <div class="w-10 h-10 rounded-lg bg-brand-subtle/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-lg font-semibold text-ink truncate">{viewingDocument.title}</h2>
            <div class="flex flex-wrap items-center gap-1.5 mt-1">
              <span class="text-xs px-2 py-0.5 bg-surface-2 text-ink-muted rounded font-medium">{getTypeLabel(viewingDocument.type)}</span>
              <span class="text-xs text-ink-subtle">{$_('documents.version')} {viewingDocument.version}</span>
              {#if viewingDocument.generatedByAi}
                <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-purple-500/12 text-purple-600 rounded">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                  {$_('documents.aiGenerated')}
                </span>
              {/if}
              {#if viewingDocument.fileSize}
                <span class="text-xs text-ink-subtle">{formatFileSize(viewingDocument.fileSize)}</span>
              {/if}
              <span class="text-xs text-ink-subtle">{new Date(viewingDocument.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <button on:click={() => viewingDocument = null} class="p-1.5 rounded-lg text-ink-subtle hover:text-ink-muted hover:bg-surface-2 transition-colors duration-150 cursor-pointer flex-shrink-0 ml-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-6">
        {#if viewingDocument.contentMd}
          <div class="prose prose-sm max-w-none prose-headings:text-ink prose-p:text-ink prose-strong:text-ink prose-ul:text-ink prose-ol:text-ink prose-li:text-ink prose-headings:mt-4 prose-headings:mb-2 prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:bg-surface-2 prose-pre:text-ink prose-pre:border prose-pre:border-border prose-pre:my-2 prose-code:text-primary-700 prose-code:bg-brand-subtle/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-[''] prose-code:after:content-[''] prose-a:text-primary-600 prose-blockquote:text-ink-muted prose-blockquote:border-primary-300">
            {@html renderMarkdown(viewingDocument.contentMd)}
          </div>
        {:else if viewingDocument.fileUrl && viewingDocument.mimeType && isImageMime(viewingDocument.mimeType)}
          <!-- Image preview -->
          <div class="flex justify-center">
            <img src="{API_URL.replace('/api', '')}{viewingDocument.fileUrl}" alt={viewingDocument.title} class="max-w-full max-h-[60vh] rounded-lg shadow-sm" />
          </div>
        {:else if viewingDocument.fileUrl}
          <!-- File document — no inline preview -->
          <div class="text-center py-12 text-ink-subtle">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 mx-auto mb-4 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <p class="text-ink-muted mb-1">{viewingDocument.fileName || viewingDocument.title}</p>
            <p class="text-sm text-ink-subtle">{$_('documents.noPreview')}</p>
          </div>
        {:else}
          <div class="text-center py-12 text-ink-subtle">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mx-auto mb-3 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <p>{$_('documents.emptyDesc')}</p>
          </div>
        {/if}
      </div>
      <div class="p-4 border-t border-border flex items-center justify-end gap-2 flex-shrink-0">
        {#if viewingDocument.fileUrl}
          <a
            href="{API_URL.replace('/api', '')}{viewingDocument.fileUrl}"
            download={viewingDocument.fileName || viewingDocument.title}
            class="px-4 py-2 border border-border rounded-lg text-sm font-medium text-ink hover:bg-surface-2 transition-colors duration-150 flex items-center gap-2"
            on:click|stopPropagation
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {$_('documents.download')}
          </a>
        {:else if viewingDocument.contentMd}
          <button
            on:click={() => downloadMarkdown(viewingDocument)}
            class="px-4 py-2 border border-border rounded-lg text-sm font-medium text-ink hover:bg-surface-2 transition-colors duration-150 cursor-pointer flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {$_('documents.download')}
          </button>
        {/if}
        <button
          on:click={() => openEdit(viewingDocument)}
          class="px-4 py-2 border border-border rounded-lg text-sm font-medium text-ink hover:bg-surface-2 transition-colors duration-150 cursor-pointer flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
          </svg>
          {$_('common.edit')}
        </button>
        <button
          on:click={() => { deletingId = viewingDocument.id; }}
          class="px-4 py-2 border border-red-500/30 text-red-500 rounded-lg text-sm font-medium hover:bg-red-500/12 transition-colors duration-150 cursor-pointer flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
          {$_('common.delete')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Edit document modal -->
{#if editingDocument}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => editingDocument = null}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-3xl">
      <div class="p-6 border-b border-border flex items-center gap-2.5">
        <div class="w-8 h-8 bg-blue-500/12 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('documents.editDocument')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="edit-title" class="block text-sm font-medium text-ink mb-1.5">{$_('documents.titleLabel')}</label>
          <input id="edit-title" type="text" bind:value={editForm.title} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        <div>
          <label for="edit-type" class="block text-sm font-medium text-ink mb-1.5">{$_('documents.type')}</label>
          <select id="edit-type" bind:value={editForm.type} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
            <option value="">{$_('documents.noType')}</option>
            {#each docTypes as t}
              <option value={t.slug}>{t.label}</option>
            {/each}
          </select>
        </div>
        {#if !editingDocument?.fileUrl}
          <div>
            <label for="edit-content" class="block text-sm font-medium text-ink mb-1.5">{$_('content.title')}</label>
            <textarea
              id="edit-content"
              bind:value={editForm.contentMd}
              rows="16"
              class="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              placeholder={$_('documents.contentPlaceholder')}
            ></textarea>
          </div>
        {/if}
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={saveEdit}
          disabled={editSaving}
          class="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if editSaving}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          {/if}
          {$_('common.save')}
        </button>
        <button on:click={() => editingDocument = null} class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Manage Types modal -->
{#if showManageTypesModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showManageTypesModal = false}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-border flex items-center gap-2.5">
        <div class="w-8 h-8 bg-surface-2 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('documents.manageTypes')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <!-- Existing types -->
        <div class="space-y-2 max-h-64 overflow-y-auto">
          {#each docTypes as t}
            <div class="flex items-center justify-between px-3 py-2 bg-surface-2 rounded-lg">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-sm font-medium text-ink truncate">{t.label}</span>
                <span class="text-xs text-ink-subtle font-mono">{t.slug}</span>
                {#if t.isDefault}
                  <span class="text-xs px-1.5 py-0.5 bg-blue-500/12 text-blue-600 rounded">default</span>
                {/if}
              </div>
              {#if isTypeInUse(t.slug)}
                <span class="text-xs text-ink-subtle flex-shrink-0" title={$_('documents.typeInUse')}>in use</span>
              {:else}
                <button
                  on:click={() => deletingTypeId = t.id}
                  class="text-xs text-red-500 hover:text-red-700 flex-shrink-0 cursor-pointer"
                  title={$_('documents.deleteType')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Delete type confirmation -->
        {#if deletingTypeId}
          <div class="px-3 py-3 bg-red-500/12 border border-red-500/30 rounded-lg">
            <p class="text-sm text-red-700 mb-2">{$_('documents.confirmDeleteType')}</p>
            <div class="flex gap-2">
              <button
                on:click={() => removeDocumentType(deletingTypeId)}
                class="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer"
              >
                {$_('common.delete')}
              </button>
              <button
                on:click={() => deletingTypeId = null}
                class="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-surface-2 cursor-pointer"
              >
                {$_('common.cancel')}
              </button>
            </div>
          </div>
        {/if}

        <!-- Add new type -->
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={newTypeLabel}
            class="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder={$_('documents.typeLabelPlaceholder')}
            on:keydown={(e) => e.key === 'Enter' && addDocumentType()}
          />
          <button
            on:click={addDocumentType}
            disabled={addingType || !newTypeLabel.trim()}
            class="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 cursor-pointer flex-shrink-0"
          >
            {$_('documents.addType')}
          </button>
        </div>
      </div>
      <div class="p-6 border-t border-border flex justify-end">
        <button on:click={() => showManageTypesModal = false} class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.close')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete confirmation modal -->
{#if deletingId}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => deletingId = null}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-sm">
      <div class="p-6">
        <div class="w-12 h-12 bg-red-500/12 rounded-xl flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink mb-2">{$_('documents.deleteDocument')}</h2>
        <p class="text-sm text-ink-muted mb-6">{$_('documents.confirmDelete')}</p>
        <div class="flex gap-3">
          <button
            on:click={() => deleteDocument(deletingId!)}
            class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors duration-150 text-sm cursor-pointer"
          >
            {$_('common.delete')}
          </button>
          <button on:click={() => deletingId = null} class="flex-1 px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer">
            {$_('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
