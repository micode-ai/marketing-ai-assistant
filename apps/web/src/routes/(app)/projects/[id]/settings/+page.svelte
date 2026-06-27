<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore, currentProjectStore, projectsStore } from '$lib/stores/projects';
  import type { GooglePlayStatusDto } from '@marketing-ai/shared-types';

  $: projectId = $page.params['id'];

  // Sync picker with this project
  $: if ($projectsStore.length > 0 && projectId) {
    const proj = $projectsStore.find((p: any) => p.id === projectId);
    if (proj && $currentProjectStore?.id !== projectId) {
      currentProjectStore.set(proj);
    }
  }
  $: isMobileApp = $currentProjectStore?.projectType === 'MOBILE_APP';

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
    // Reset displayed/derived state for the previous project
    loading = true;
    allAccounts = [];
    enabledIds = new Set();
    trackingInfo = null;
    baseCurrency = 'USD';
    projectWebsite = '';
    gpStatus = null;
    gscConfig = null;
    gscSiteUrl = '';
    gscSites = [];

    if (!$organizationIdStore) { loading = false; return; }
    try {
      const [all, enabled, tracking, project] = await Promise.all([
        api.get<any[]>('/social/accounts', { organizationId: $organizationIdStore }),
        api.get<any[]>('/social/project-accounts', { projectId }),
        api.get<{ trackingId: string; snippetUrl: string }>(`/projects/${projectId}/tracking`),
        api.get<any>(`/projects/${projectId}`),
      ]);
      allAccounts = all;
      enabledIds = new Set(enabled.map((a: any) => a.id));
      trackingInfo = tracking;
      if (project.baseCurrency) baseCurrency = project.baseCurrency;
      if (project.websiteUrl) projectWebsite = project.websiteUrl;
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }

    if (isMobileApp) {
      await fetchGpStatus();
    }

    await fetchGscConfig();
  }

  const currencies = ['USD', 'EUR', 'GBP', 'PLN', 'RUB', 'UAH', 'BYN', 'KZT', 'TRY', 'JPY', 'CNY'];
  let baseCurrency = 'USD';
  let currencySaved = false;

  let allAccounts: any[] = [];
  let enabledIds: Set<string> = new Set();
  let loading = true;
  let saving = false;
  let saved = false;

  let trackingInfo: { trackingId: string; snippetUrl: string } | null = null;
  let snippetCopied = false;

  // Google Play connection state
  let gpStatus: GooglePlayStatusDto | null = null;
  let gpLoading = false;
  let gpSyncing = false;
  let gpDisconnecting = false;
  let gpShowServiceAccountForm = false;
  let gpPackageName = '';
  let gpServiceAccountFile: File | null = null;
  let gpConnecting = false;
  let gpError = '';
  let gpSuccess = '';
  let gpBucketUri = '';
  let gpBucketSaving = false;
  let showDisconnectConfirm = false;

  // Google Search Console state
  let gscConfig: { siteUrl?: string; accessToken?: string } | null = null;
  let gscLoading = false;
  let gscSiteUrl = '';
  let gscSites: Array<{ siteUrl: string; permissionLevel: string }> = [];
  let gscSitesLoading = false;
  let gscSaving = false;
  let gscDisconnecting = false;
  let gscError = '';
  let gscSuccess = '';
  let projectWebsite = '';

  const platformIcon: Record<string, string> = {
    LINKEDIN: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
    TWITTER: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    FACEBOOK: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
    TELEGRAM: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
    INSTAGRAM: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>`,
    THREADS: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.781 3.631 2.695 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L9.295 7.575c.98-1.452 2.568-2.246 4.476-2.246h.044c3.194.02 5.097 1.978 5.287 5.388.108.046.216.094.323.143 1.504.708 2.604 1.78 3.182 3.099.806 1.837.881 4.83-1.55 7.208-1.86 1.82-4.118 2.64-7.31 2.663Zm1.036-11.564c-.318 0-.64.01-.965.027-1.84.103-2.991.95-2.928 2.157.067 1.27 1.466 1.853 2.748 1.784 1.183-.064 2.751-.524 3.013-3.727a10.49 10.49 0 0 0-1.868-.241Z"/></svg>`,
  };

  const platformColor: Record<string, string> = {
    LINKEDIN: 'text-[#0077B5] bg-[#0077B5]/10',
    TWITTER: 'text-ink bg-surface-2',
    FACEBOOK: 'text-[#1877F2] bg-[#1877F2]/10',
    TELEGRAM: 'text-[#26A5E4] bg-[#26A5E4]/10',
    INSTAGRAM: 'text-[#E1306C] bg-[#E1306C]/10',
    THREADS: 'text-white bg-black',
  };

  onMount(async () => {
    // Check URL params for Google Play connection result
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('google') === 'connected') {
      gscSuccess = $_('seo.gscConfig.connected') + '!';
      setTimeout(() => { gscSuccess = ''; }, 5000);
      const urlClean = new URL(window.location.href);
      urlClean.searchParams.delete('google');
      window.history.replaceState({}, '', urlClean.toString());
    } else if (urlParams.get('google') === 'error') {
      gscError = $_('seo.syncFailed');
      setTimeout(() => { gscError = ''; }, 5000);
      const urlClean = new URL(window.location.href);
      urlClean.searchParams.delete('google');
      window.history.replaceState({}, '', urlClean.toString());
    }

    if (urlParams.get('googlePlay') === 'connected') {
      gpSuccess = 'Google Play Console connected successfully!';
      setTimeout(() => { gpSuccess = ''; }, 5000);
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('googlePlay');
      window.history.replaceState({}, '', url.toString());
    } else if (urlParams.get('googlePlay') === 'error') {
      gpError = 'Failed to connect Google Play Console. Please try again.';
      setTimeout(() => { gpError = ''; }, 5000);
      const url = new URL(window.location.href);
      url.searchParams.delete('googlePlay');
      window.history.replaceState({}, '', url.toString());
    }

    if (!$organizationIdStore) { loading = false; return; }
    try {
      const [all, enabled, tracking, project] = await Promise.all([
        api.get<any[]>('/social/accounts', { organizationId: $organizationIdStore }),
        api.get<any[]>('/social/project-accounts', { projectId }),
        api.get<{ trackingId: string; snippetUrl: string }>(`/projects/${projectId}/tracking`),
        api.get<any>(`/projects/${projectId}`),
      ]);
      allAccounts = all;
      enabledIds = new Set(enabled.map((a: any) => a.id));
      trackingInfo = tracking;
      if (project.baseCurrency) baseCurrency = project.baseCurrency;
      if (project.websiteUrl) projectWebsite = project.websiteUrl;
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }

    // Fetch Google Play status if mobile app
    if (isMobileApp) {
      await fetchGpStatus();
    }

    // Fetch GSC config
    await fetchGscConfig();

    prevProjectId = projectId;
    mounted = true;
  });

  async function saveBaseCurrency() {
    try {
      await api.put(`/projects/${projectId}`, { baseCurrency });
      currencySaved = true;
      setTimeout(() => { currencySaved = false; }, 2500);
    } catch (e: any) {
      console.error(e);
    }
  }

  function toggle(id: string) {
    const next = new Set(enabledIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    enabledIds = next;
  }

  async function copySnippet() {
    if (!trackingInfo) return;
    try {
      const res = await fetch(trackingInfo.snippetUrl);
      const fullSnippet = await res.text();
      await navigator.clipboard.writeText(fullSnippet);
      snippetCopied = true;
      setTimeout(() => { snippetCopied = false; }, 2500);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  }

  async function save() {
    saving = true;
    saved = false;
    try {
      await api.put('/social/project-accounts', {
        projectId,
        socialAccountIds: [...enabledIds],
      });
      saved = true;
      setTimeout(() => { saved = false; }, 2500);
    } catch (e: any) {
      alert(e.message);
    } finally {
      saving = false;
    }
  }

  // Google Play functions
  async function fetchGpStatus() {
    gpLoading = true;
    try {
      gpStatus = await api.get<GooglePlayStatusDto>('/google-play/status', { projectId });
      gpBucketUri = gpStatus?.gcsBucketUri || '';
    } catch {
      gpStatus = null;
    } finally {
      gpLoading = false;
    }
  }

  async function connectOAuth() {
    try {
      const result = await api.get<{ url: string }>('/google-play/auth-url', { projectId });
      window.location.href = result.url;
    } catch (e: any) {
      gpError = e.message || 'Failed to start OAuth flow';
      setTimeout(() => { gpError = ''; }, 5000);
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      gpServiceAccountFile = input.files[0];
    }
  }

  async function connectServiceAccount() {
    if (!gpServiceAccountFile || !gpPackageName.trim()) return;
    gpConnecting = true;
    gpError = '';
    try {
      const text = await gpServiceAccountFile.text();
      // Validate JSON
      try { JSON.parse(text); } catch { gpError = $_('googlePlay.connection.errors.invalidKey'); gpConnecting = false; return; }

      await api.post('/google-play/connect/service-account', {
        projectId,
        serviceAccountKey: text,
        packageName: gpPackageName.trim(),
      });
      gpSuccess = 'Google Play Console connected successfully!';
      setTimeout(() => { gpSuccess = ''; }, 5000);
      gpShowServiceAccountForm = false;
      gpPackageName = '';
      gpServiceAccountFile = null;
      await fetchGpStatus();
    } catch (e: any) {
      gpError = e.message || 'Failed to connect';
      setTimeout(() => { gpError = ''; }, 5000);
    } finally {
      gpConnecting = false;
    }
  }

  async function savePackageName() {
    if (!gpPackageName.trim()) return;
    try {
      await api.post('/google-play/config/package-name', {
        projectId,
        packageName: gpPackageName.trim(),
      });
      gpSuccess = 'Package name saved!';
      setTimeout(() => { gpSuccess = ''; }, 3000);
      await fetchGpStatus();
    } catch (e: any) {
      gpError = e.message || 'Failed to save';
      setTimeout(() => { gpError = ''; }, 5000);
    }
  }

  async function saveBucketUri() {
    if (!gpBucketUri.trim()) return;
    gpBucketSaving = true;
    gpError = '';
    try {
      await api.post('/google-play/config/bucket', {
        projectId,
        gcsBucketUri: gpBucketUri.trim(),
      });
      gpSuccess = 'Cloud Storage URI saved! Install data will sync on next refresh.';
      setTimeout(() => { gpSuccess = ''; }, 5000);
    } catch (e: any) {
      gpError = e.message || 'Failed to save bucket URI';
      setTimeout(() => { gpError = ''; }, 5000);
    } finally {
      gpBucketSaving = false;
    }
  }

  async function syncNow() {
    gpSyncing = true;
    try {
      await api.post('/google-play/sync', { projectId });
      gpSuccess = 'Sync started!';
      setTimeout(() => { gpSuccess = ''; }, 3000);
      // Poll status after a delay
      setTimeout(fetchGpStatus, 3000);
    } catch (e: any) {
      gpError = e.message || 'Sync failed';
      setTimeout(() => { gpError = ''; }, 5000);
    } finally {
      gpSyncing = false;
    }
  }

  async function disconnectGooglePlay() {
    gpDisconnecting = true;
    try {
      await api.delete(`/google-play/disconnect?projectId=${projectId}`);
      gpStatus = { connected: false, authMethod: null, packageName: null, lastSyncAt: null, initialSyncCompleted: false, consecutiveFailures: 0, status: null };
      showDisconnectConfirm = false;
      gpSuccess = 'Google Play Console disconnected.';
      setTimeout(() => { gpSuccess = ''; }, 3000);
    } catch (e: any) {
      gpError = e.message || 'Failed to disconnect';
      setTimeout(() => { gpError = ''; }, 5000);
    } finally {
      gpDisconnecting = false;
    }
  }

  function formatLastSync(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  // Google Search Console functions
  async function fetchGscConfig() {
    gscLoading = true;
    try {
      const result = await api.get<any>('/google/integration', { projectId });
      gscConfig = result;
      gscSiteUrl = result?.siteUrl || '';
      if (result?.accessToken) {
        await fetchGscSites();
      }
    } catch {
      gscConfig = null;
    } finally {
      gscLoading = false;
    }
  }

  async function fetchGscSites() {
    gscSitesLoading = true;
    try {
      const { sites } = await api.get<{ sites: Array<{ siteUrl: string; permissionLevel: string }> }>(
        '/google/gsc/sites',
        { projectId },
      );
      gscSites = sites;
      // Pre-select if nothing saved yet
      if (!gscSiteUrl && sites.length > 0) {
        gscSiteUrl = pickBestSiteUrl(sites, projectWebsite);
      }
    } catch {
      gscSites = [];
    } finally {
      gscSitesLoading = false;
    }
  }

  function pickBestSiteUrl(
    sites: Array<{ siteUrl: string }>,
    website: string,
  ): string {
    if (sites.length === 0) return '';
    if (!website) return sites[0]!.siteUrl;
    const hostMatch = (a: string, b: string): boolean => {
      try {
        const ha = new URL(a).hostname.replace(/^www\./, '').toLowerCase();
        const hb = new URL(b).hostname.replace(/^www\./, '').toLowerCase();
        return ha === hb;
      } catch {
        return false;
      }
    };
    // Prefer sc-domain: that covers the project domain
    for (const s of sites) {
      if (s.siteUrl.startsWith('sc-domain:')) {
        const domain = s.siteUrl.replace('sc-domain:', '').toLowerCase();
        try {
          if (new URL(website).hostname.replace(/^www\./, '').toLowerCase() === domain) {
            return s.siteUrl;
          }
        } catch {
          // ignore
        }
      }
    }
    // Then URL-prefix property that matches
    for (const s of sites) {
      if (!s.siteUrl.startsWith('sc-domain:') && hostMatch(s.siteUrl, website)) {
        return s.siteUrl;
      }
    }
    return sites[0]!.siteUrl;
  }

  async function connectGsc() {
    try {
      const result = await api.get<{ url: string }>('/google/auth-url', { projectId });
      window.location.href = result.url;
    } catch (e: any) {
      gscError = e.message || 'Failed to start Google OAuth';
    }
  }

  async function saveGscSiteUrl() {
    if (!gscSiteUrl.trim()) return;
    gscSaving = true;
    gscError = '';
    try {
      await api.post('/google/config', { projectId, type: 'gsc', siteUrl: gscSiteUrl.trim() });
      gscSuccess = $_('seo.gscConfig.saveSuccess');
      setTimeout(() => { gscSuccess = ''; }, 3000);
      await fetchGscConfig();
    } catch (e: any) {
      gscError = e.message || $_('seo.syncFailed');
      setTimeout(() => { gscError = ''; }, 5000);
    } finally {
      gscSaving = false;
    }
  }

  async function disconnectGsc() {
    gscDisconnecting = true;
    gscError = '';
    try {
      await api.delete(`/google/integration?projectId=${projectId}`);
      gscConfig = null;
      gscSiteUrl = '';
      gscSuccess = $_('seo.gscConfig.disconnect');
      setTimeout(() => { gscSuccess = ''; }, 3000);
    } catch (e: any) {
      gscError = e.message || $_('seo.syncFailed');
      setTimeout(() => { gscError = ''; }, 5000);
    } finally {
      gscDisconnecting = false;
    }
  }

</script>

<div class="p-6 max-w-2xl">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-ink">{$_('projects.settings')}</h1>
  </div>

  <!-- Base Currency section -->
  <div class="bg-surface rounded-xl border border-border p-5 mb-6">
    <div class="mb-4">
      <h2 class="text-base font-semibold text-ink">{$_('projects.baseCurrency')}</h2>
    </div>
    <select
      bind:value={baseCurrency}
      on:change={saveBaseCurrency}
      class="w-full max-w-xs px-3 py-2 bg-surface border border-border rounded-lg text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      {#each currencies as c}
        <option value={c}>{c}</option>
      {/each}
    </select>
    <p class="text-sm text-ink-muted mt-2">{$_('projects.baseCurrencyWarning')}</p>
    {#if currencySaved}
      <span class="text-sm text-green-600 flex items-center gap-1 mt-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        {$_('common.saved')}
      </span>
    {/if}
  </div>

  <!-- Social Networks section -->
  <div class="bg-surface rounded-xl border border-border p-5">
    <div class="mb-4">
      <h2 class="text-base font-semibold text-ink">{$_('projects.socialNetworks')}</h2>
      <p class="text-sm text-ink-muted mt-0.5">{$_('projects.socialNetworksDesc')}</p>
    </div>

    {#if loading}
      <div class="space-y-2">
        {#each Array(3) as _}
          <div class="h-12 bg-surface-2 rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else if allAccounts.length === 0}
      <div class="text-center py-8 text-ink-muted">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 mx-auto mb-3 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </svg>
        <p class="text-sm font-medium text-ink-muted mb-1">{$_('projects.noOrgAccounts')}</p>
        <a href="/settings/integrations" class="text-sm text-brand hover:underline">{$_('projects.noOrgAccountsLink')}</a>
      </div>
    {:else}
      <div class="space-y-2 mb-4">
        {#each allAccounts as account}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors duration-150 {enabledIds.has(account.id) ? 'border-primary-400 bg-brand-subtle/10' : 'border-border hover:bg-surface-2'}"
            on:click={() => toggle(account.id)}
          >
            <input
              type="checkbox"
              checked={enabledIds.has(account.id)}
              class="w-4 h-4 text-brand rounded border-border cursor-pointer flex-shrink-0"
              readonly
            />
            <div class="w-8 h-8 rounded-lg {platformColor[account.platform] || 'bg-surface-2 text-ink-muted'} flex items-center justify-center flex-shrink-0">
              {@html platformIcon[account.platform] || ''}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-ink truncate" title={account.accountName}>{account.accountName}</div>
              <div class="text-xs text-ink-muted flex items-center gap-1.5">
                <span>{account.platform}</span>
                {#if account.accountId}
                  <span class="text-ink-subtle">·</span>
                  <span class="font-mono truncate" title={account.accountId}>{account.accountId}</span>
                {/if}
              </div>
            </div>
            {#if enabledIds.has(account.id)}
              <span class="text-xs px-2 py-0.5 bg-primary-100 text-brand rounded-full flex-shrink-0">{$_('social.connected')}</span>
            {/if}
          </div>
        {/each}
      </div>

      <div class="flex items-center gap-3">
        <button
          on:click={save}
          disabled={saving}
          class="px-5 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
        >
          {saving ? $_('common.loading') : $_('common.save')}
        </button>
        {#if saved}
          <span class="text-sm text-green-600 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            {$_('projects.socialAccountsSaved')}
          </span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Website Tracking section -->
  <div class="bg-surface rounded-xl border border-border p-5 mt-6">
    <div class="mb-4">
      <h2 class="text-base font-semibold text-ink">{$_('tracking.title')}</h2>
      <p class="text-sm text-ink-muted mt-0.5">{$_('tracking.description')}</p>
    </div>

    {#if trackingInfo}
      <div class="mb-4">
        <label class="block text-xs font-medium text-ink-muted mb-1">{$_('tracking.trackingId')}</label>
        <code class="text-sm bg-surface-2 px-3 py-1.5 rounded border border-border font-mono inline-block">{trackingInfo.trackingId}</code>
      </div>

      <div class="mb-4">
        <label class="block text-xs font-medium text-ink-muted mb-1">{$_('tracking.snippet')}</label>
        <pre class="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto max-h-48 whitespace-pre-wrap">&lt;!-- Marketing AI Tracking --&gt;
&lt;script src="{trackingInfo.snippetUrl}"&gt;&lt;/script&gt;</pre>
      </div>

      <div class="flex items-center gap-3 mb-5">
        <button
          on:click={copySnippet}
          class="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 cursor-pointer flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {snippetCopied ? $_('common.copied') : $_('tracking.copySnippet')}
        </button>
        <p class="text-xs text-ink-muted">{$_('tracking.copyHint')}</p>
      </div>

      <div class="border-t border-border pt-4 space-y-3">
        <div>
          <h3 class="text-xs font-semibold text-ink">{$_('tracking.customEvents')}</h3>
          <code class="text-xs text-ink-muted font-mono">mktai('event', 'button_click', &#123;label: 'signup'&#125;)</code>
        </div>
        <div>
          <h3 class="text-xs font-semibold text-ink">{$_('tracking.conversions')}</h3>
          <code class="text-xs text-ink-muted font-mono">mktai('conversion', 'purchase', &#123;value: 99&#125;)</code>
        </div>
      </div>
    {:else if !loading}
      <div class="text-sm text-ink-muted">{$_('common.loading')}</div>
    {/if}
  </div>

  <!-- Google Search Console section -->
  <div class="bg-surface rounded-xl border border-border p-5 mt-6">
    <div class="mb-4">
      <h2 class="text-base font-semibold text-ink">{$_('seo.gscConfig.title')}</h2>
      <p class="text-sm text-ink-muted mt-0.5">{$_('seo.gscConfig.description')}</p>
    </div>

    {#if gscSuccess}
      <div class="mb-4 p-3 bg-green-500/12 border border-green-500/30 rounded-lg text-sm text-green-700 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        {gscSuccess}
      </div>
    {/if}
    {#if gscError}
      <div class="mb-4 p-3 bg-red-500/12 border border-red-500/30 rounded-lg text-sm text-red-700 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
        {gscError}
      </div>
    {/if}

    {#if gscLoading}
      <div class="space-y-2">
        {#each Array(2) as _}
          <div class="h-10 bg-surface-2 rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else if gscConfig?.accessToken}
      <!-- Connected state -->
      <div class="space-y-4">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-green-500"></div>
          <span class="text-sm font-medium text-ink">{$_('seo.gscConfig.connected')}</span>
        </div>

        <div>
          <label class="block text-xs font-medium text-ink-muted mb-1.5">
            {$_('seo.gscConfig.siteUrl')}
            <span class="font-normal text-ink-subtle ml-1">— {$_('seo.gscConfig.siteUrlHelper')}</span>
          </label>
          {#if gscSitesLoading}
            <div class="h-10 bg-surface-2 rounded-lg animate-pulse"></div>
          {:else if gscSites.length === 0}
            <div class="p-3 bg-amber-500/12 border border-amber-500/30 rounded-lg text-xs text-amber-800">
              No verified properties found in this Google account. Add and verify your site in <a href="https://search.google.com/search-console" target="_blank" rel="noopener" class="underline">Google Search Console</a>, then reconnect.
            </div>
          {:else}
            <div class="flex gap-2">
              <select
                bind:value={gscSiteUrl}
                class="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {#each gscSites as site}
                  <option value={site.siteUrl}>{site.siteUrl}</option>
                {/each}
              </select>
              <button
                on:click={saveGscSiteUrl}
                disabled={gscSaving || !gscSiteUrl}
                class="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors duration-150 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                {gscSaving ? $_('common.loading') : $_('seo.gscConfig.save')}
              </button>
            </div>
            {#if projectWebsite}
              <p class="text-xs text-ink-muted mt-1.5">
                Project website: <span class="font-medium">{projectWebsite}</span> — pre-selected the matching property if available.
              </p>
            {/if}
          {/if}
        </div>

        <button
          on:click={disconnectGsc}
          disabled={gscDisconnecting}
          class="px-4 py-2 text-red-600 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/12 transition-colors duration-150 cursor-pointer disabled:opacity-50"
        >
          {gscDisconnecting ? $_('common.loading') : $_('seo.gscConfig.disconnect')}
        </button>
      </div>
    {:else}
      <!-- Not connected state -->
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-border-strong"></div>
          <span class="text-sm text-ink-muted">{$_('common.notConnected') || 'Not connected'}</span>
        </div>
        <button
          on:click={connectGsc}
          class="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 cursor-pointer flex items-center gap-2"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {$_('seo.gscConfig.connect')}
        </button>
        <p class="text-xs text-ink-subtle">
          Pick the property verified in Search Console for this project. The app will pull rank positions from yesterday's GSC data.
        </p>
      </div>
    {/if}
  </div>

  <!-- Google Play Console section (mobile apps only) -->
  {#if isMobileApp}
    <div class="bg-surface rounded-xl border border-border p-5 mt-6">
      <div class="mb-4">
        <h2 class="text-base font-semibold text-ink">{$_('googlePlay.connection.title')}</h2>
        <p class="text-sm text-ink-muted mt-0.5">{$_('googlePlay.connection.description')}</p>
      </div>

      <!-- Success / Error banners -->
      {#if gpSuccess}
        <div class="mb-4 p-3 bg-green-500/12 border border-green-500/30 rounded-lg text-sm text-green-700 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          {gpSuccess}
        </div>
      {/if}
      {#if gpError}
        <div class="mb-4 p-3 bg-red-500/12 border border-red-500/30 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          {gpError}
        </div>
      {/if}

      {#if gpLoading}
        <div class="space-y-2">
          {#each Array(2) as _}
            <div class="h-10 bg-surface-2 rounded-lg animate-pulse"></div>
          {/each}
        </div>
      {:else if gpStatus?.connected}
        <!-- Connected state -->
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-3 h-3 rounded-full {gpStatus.status === 'OK' ? 'bg-green-500' : gpStatus.status === 'ERROR' ? 'bg-red-500' : 'bg-yellow-500'}"></div>
            <span class="text-sm font-medium text-ink">
              {#if gpStatus.status === 'OK'}{$_('googlePlay.connection.status.ok')}
              {:else if gpStatus.status === 'ERROR'}{$_('googlePlay.connection.status.error')}
              {:else}{$_('googlePlay.connection.status.syncing')}
              {/if}
            </span>
            {#if gpStatus.authMethod}
              <span class="text-xs bg-surface-2 text-ink-muted px-2 py-0.5 rounded-full">{gpStatus.authMethod === 'oauth2' ? 'OAuth' : 'Service Account'}</span>
            {/if}
          </div>

          <div>
            <span class="text-xs font-medium text-ink-muted">{$_('googlePlay.connection.packageName')}</span>
            {#if gpStatus.packageName}
              <code class="ml-2 text-sm bg-surface-2 px-2 py-0.5 rounded border border-border font-mono">{gpStatus.packageName}</code>
            {:else}
              <div class="flex gap-2 mt-1">
                <input
                  type="text"
                  bind:value={gpPackageName}
                  placeholder={$_('googlePlay.connection.enterPackageName')}
                  class="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
                />
                <button
                  on:click={savePackageName}
                  disabled={!gpPackageName.trim()}
                  class="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors duration-150 disabled:opacity-40 cursor-pointer"
                >
                  {$_('common.save')}
                </button>
              </div>
            {/if}
          </div>

          <div class="text-xs text-ink-muted">
            {$_('googlePlay.connection.lastSync', { values: { time: formatLastSync(gpStatus.lastSyncAt) } })}
          </div>

          {#if gpStatus.consecutiveFailures > 0}
            <div class="text-xs text-red-500">
              {$_('googlePlay.connection.errors.syncFailed')}
            </div>
          {/if}

          <!-- Cloud Storage Bucket URI -->
          <div class="mt-3 p-3 bg-surface-2 rounded-lg border border-border">
            <label class="block text-xs font-medium text-ink-muted mb-1.5">
              Cloud Storage URI
              <span class="font-normal text-ink-subtle">(Google Play Console → Download reports → Copy Cloud Storage URI)</span>
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                bind:value={gpBucketUri}
                placeholder="gs://pubsite_prod_rev_XXXXXXXXXXXX"
                class="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
              />
              <button
                on:click={saveBucketUri}
                disabled={gpBucketSaving || !gpBucketUri.trim() || !gpBucketUri.startsWith('gs://')}
                class="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors duration-150 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                {#if gpBucketSaving}
                  Saving...
                {:else}
                  Save
                {/if}
              </button>
            </div>
            <p class="text-xs text-ink-subtle mt-1.5">Required for install counts, ratings distribution, and store listing performance data.</p>
          </div>

          <div class="flex items-center gap-3">
            <button
              on:click={syncNow}
              disabled={gpSyncing}
              class="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              {#if gpSyncing}
                <svg class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {$_('googlePlay.connection.syncing')}
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                {$_('googlePlay.connection.syncNow')}
              {/if}
            </button>
            <button
              on:click={() => { showDisconnectConfirm = true; }}
              class="px-4 py-2 text-red-600 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/12 transition-colors duration-150 cursor-pointer"
            >
              {$_('googlePlay.connection.disconnect')}
            </button>
          </div>
        </div>

        <!-- Disconnect confirmation modal -->
        {#if showDisconnectConfirm}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" on:click|self={() => { showDisconnectConfirm = false; }}>
            <div class="bg-surface rounded-xl shadow-xl p-6 max-w-sm mx-4">
              <h3 class="text-lg font-semibold text-ink mb-2">{$_('googlePlay.connection.disconnect')}</h3>
              <p class="text-sm text-ink-muted mb-5">{$_('googlePlay.connection.disconnectConfirm')}</p>
              <div class="flex items-center gap-3 justify-end">
                <button
                  on:click={() => { showDisconnectConfirm = false; }}
                  class="px-4 py-2 text-sm text-ink-muted border border-border rounded-lg hover:bg-surface-2 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  on:click={disconnectGooglePlay}
                  disabled={gpDisconnecting}
                  class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
                >
                  {gpDisconnecting ? $_('common.loading') : $_('googlePlay.connection.disconnect')}
                </button>
              </div>
            </div>
          </div>
        {/if}

      {:else}
        <!-- Not connected state -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 mb-2">
            <div class="w-3 h-3 rounded-full bg-border-strong"></div>
            <span class="text-sm text-ink-muted">{$_('googlePlay.connection.disconnected')}</span>
          </div>

          <div class="flex flex-wrap gap-3">
            <button
              on:click={connectOAuth}
              class="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 cursor-pointer flex items-center gap-2"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {$_('googlePlay.connection.connectOAuth')}
            </button>
            <button
              on:click={() => { gpShowServiceAccountForm = !gpShowServiceAccountForm; }}
              class="px-4 py-2 text-ink border border-border rounded-lg text-sm font-medium hover:bg-surface-2 transition-colors duration-150 cursor-pointer"
            >
              {$_('googlePlay.connection.connectServiceAccount')}
            </button>
          </div>

          {#if gpShowServiceAccountForm}
            <div class="border border-border rounded-lg p-4 space-y-3 mt-3">
              <div>
                <label class="block text-xs font-medium text-ink-muted mb-1">{$_('googlePlay.connection.uploadJson')}</label>
                <input
                  type="file"
                  accept=".json"
                  on:change={handleFileSelect}
                  class="block w-full text-sm text-ink-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-subtle/10 file:text-primary-700 hover:file:bg-primary-100 file:cursor-pointer cursor-pointer"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-ink-muted mb-1">{$_('googlePlay.connection.packageName')}</label>
                <input
                  type="text"
                  bind:value={gpPackageName}
                  placeholder={$_('googlePlay.connection.enterPackageName')}
                  class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                on:click={connectServiceAccount}
                disabled={gpConnecting || !gpServiceAccountFile || !gpPackageName.trim()}
                class="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
              >
                {gpConnecting ? $_('common.loading') : $_('googlePlay.connection.connectServiceAccount')}
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
