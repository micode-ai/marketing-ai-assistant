<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { _ } from 'svelte-i18n';
  import { createEventDispatcher } from 'svelte';

  export let value = '';
  export let placeholder = '';
  export let imageUploadUrl = '/api/uploads/image';
  export let onImageUpload: ((url: string) => void) | undefined = undefined;

  const dispatch = createEventDispatcher();

  let textarea: HTMLTextAreaElement;
  let fileInput: HTMLInputElement;
  let uploading = false;

  $: html = DOMPurify.sanitize(marked.parse(value, { async: false }) as string);

  function insertAtCursor(before: string, after = '') {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    value = value.slice(0, start) + before + selected + after + value.slice(end);
    const cursorPos = start + before.length + selected.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }

  function bold() { insertAtCursor('**', '**'); }
  function italic() { insertAtCursor('*', '*'); }
  function h1() { insertAtCursor('\n# '); }
  function h2() { insertAtCursor('\n## '); }
  function list() { insertAtCursor('\n- '); }
  function link() { insertAtCursor('[', '](url)'); }
  function image() { fileInput?.click(); }

  async function handleFileUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    uploading = true;
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(imageUploadUrl, { method: 'POST', body: form, credentials: 'include' });
      const data = await res.json();
      insertAtCursor(`![${file.name}](${data.url})`);
      onImageUpload?.(data.url);
      dispatch('imageUpload', data);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      uploading = false;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      handleFileUpload({ target: fileInput } as any);
    }
  }

  function handleDragOver(e: DragEvent) { e.preventDefault(); }
</script>

<div class="markdown-editor border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden flex flex-col h-full">
  <!-- Toolbar -->
  <div class="flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600 flex-shrink-0">
    <button type="button" on:click={bold} class="toolbar-btn" title="Bold"><b>B</b></button>
    <button type="button" on:click={italic} class="toolbar-btn" title="Italic"><i>I</i></button>
    <button type="button" on:click={h1} class="toolbar-btn" title="H1">H1</button>
    <button type="button" on:click={h2} class="toolbar-btn" title="H2">H2</button>
    <button type="button" on:click={list} class="toolbar-btn" title="List">*</button>
    <button type="button" on:click={link} class="toolbar-btn" title="Link">Link</button>
    <button type="button" on:click={image} class="toolbar-btn" title="Image" disabled={uploading}>
      {uploading ? '...' : 'Img'}
    </button>
  </div>

  <!-- Split view -->
  <div class="flex flex-1 min-h-[300px]">
    <!-- Editor -->
    <div class="w-1/2 border-r border-gray-300 dark:border-gray-600 flex"
         on:drop={handleDrop} on:dragover={handleDragOver} role="textbox" tabindex="-1">
      <textarea
        bind:this={textarea}
        bind:value
        {placeholder}
        class="w-full h-full p-3 resize-none bg-white dark:bg-gray-800 text-sm font-mono focus:outline-none"
      />
    </div>

    <!-- Preview -->
    <div class="w-1/2 p-3 prose dark:prose-invert prose-sm max-w-none overflow-y-auto bg-gray-50 dark:bg-gray-900">
      {@html html}
    </div>
  </div>

  <input type="file" accept="image/jpeg,image/png,image/webp" bind:this={fileInput}
         on:change={handleFileUpload} class="hidden" />
</div>

<style>
  .toolbar-btn {
    @apply px-2 py-1 text-sm rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300;
  }
</style>
