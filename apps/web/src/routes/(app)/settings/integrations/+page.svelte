<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore } from '$lib/stores/projects';

  let accounts: any[] = [];
  let loading = true;

  // LinkedIn modal
  let showLinkedInModal = false;
  let linkedInForm = { accountName: '', accountId: '', accessToken: '', language: '' };
  let linkedInSaving = false;

  // Twitter modal
  let showTwitterModal = false;
  let twitterForm = { accountName: '', accountId: '', appKey: '', appSecret: '', accessToken: '', accessSecret: '', language: '' };
  let twitterSaving = false;

  // Facebook modal
  let showFacebookModal = false;
  let facebookForm = { accountName: '', pageId: '', accessToken: '', language: '' };
  let facebookSaving = false;

  // Telegram modal
  let showTelegramModal = false;
  let telegramForm = { accountName: '', botToken: '', chatId: '', language: '' };
  let telegramSaving = false;

  let disconnectingId: string | null = null;

  // Toast notification (same pattern as the SEO page)
  let toast: { message: string; type: 'success' | 'error' | 'warning' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string, type: 'success' | 'error' | 'warning' = 'error') {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message: message || $_('social.instagram.error'), type };
    toastTimer = setTimeout(() => { toast = null; }, 5000);
  }

  onMount(async () => {
    if ($organizationIdStore) {
      await loadAccounts();
    }
    loading = false;

    const params = new URLSearchParams(window.location.search);
    if (params.get('instagram') === 'connected') {
      showToast($_('social.instagram.connected'), 'success');
      history.replaceState(null, '', window.location.pathname);
    } else if (params.get('instagram') === 'error') {
      const reason = params.get('reason');
      showToast(reason === 'no_ig_account' ? $_('social.instagram.noAccount') : $_('social.instagram.error'), 'error');
      history.replaceState(null, '', window.location.pathname);
    } else if (params.get('threads') === 'connected') {
      showToast($_('social.threads.connected'), 'success');
      history.replaceState(null, '', window.location.pathname);
    } else if (params.get('threads') === 'error') {
      const reason = params.get('reason');
      showToast(reason === 'no_threads_account' ? $_('social.threads.noAccount') : $_('social.threads.error'), 'error');
      history.replaceState(null, '', window.location.pathname);
    }
  });

  async function loadAccounts() {
    try {
      accounts = await api.get<any[]>('/social/accounts', { organizationId: $organizationIdStore! });
      await autoRefreshTelegramNames();
    } catch (e) {
      console.error(e);
    }
  }

  async function autoRefreshTelegramNames() {
    const suspicious = accounts.filter(
      (a) =>
        a.platform === 'TELEGRAM' &&
        (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.accountName || '') || a.accountName === a.accountId),
    );
    if (suspicious.length === 0) return;
    const updates = await Promise.all(
      suspicious.map((a) =>
        api.post<any>(`/social/accounts/${a.id}/refresh-telegram`, {}).catch(() => null),
      ),
    );
    const byId: Record<string, any> = {};
    for (const u of updates) if (u?.id) byId[u.id] = u;
    accounts = accounts.map((a) => (byId[a.id] ? { ...a, ...byId[a.id] } : a));
  }

  async function connectLinkedIn() {
    if (!$organizationIdStore) return;
    linkedInSaving = true;
    try {
      await api.post(`/social/accounts?organizationId=${$organizationIdStore}`, {
        platform: 'LINKEDIN',
        accountName: linkedInForm.accountName,
        accountId: linkedInForm.accountId,
        accessToken: linkedInForm.accessToken,
        language: linkedInForm.language || null,
        scopes: ['w_member_social'],
      });
      showLinkedInModal = false;
      linkedInForm = { accountName: '', accountId: '', accessToken: '', language: '' };
      await loadAccounts();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      linkedInSaving = false;
    }
  }

  async function connectTwitter() {
    if (!$organizationIdStore) return;
    twitterSaving = true;
    try {
      await api.post(`/social/accounts?organizationId=${$organizationIdStore}`, {
        ...twitterForm,
        platform: 'TWITTER',
        language: twitterForm.language || null,
        scopes: ['tweet.write', 'tweet.read', 'users.read'],
      });
      showTwitterModal = false;
      twitterForm = { accountName: '', accountId: '', appKey: '', appSecret: '', accessToken: '', accessSecret: '', language: '' };
      await loadAccounts();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      twitterSaving = false;
    }
  }

  let editingFacebookId: string | null = null;

  function openEditFacebook(account: any) {
    editingFacebookId = account.id;
    facebookForm = {
      accountName: account.accountName || '',
      pageId: account.accountId || '',
      accessToken: '',
      language: account.language || '',
    };
    showFacebookModal = true;
  }

  function closeFacebookModal() {
    showFacebookModal = false;
    editingFacebookId = null;
    facebookForm = { accountName: '', pageId: '', accessToken: '', language: '' };
  }

  async function connectFacebook() {
    if (!$organizationIdStore) return;
    facebookSaving = true;
    try {
      if (editingFacebookId) {
        await api.put(`/social/accounts/${editingFacebookId}`, {
          accountName: facebookForm.accountName,
          accountId: facebookForm.pageId,
          pageId: facebookForm.pageId,
          accessToken: facebookForm.accessToken,
          language: facebookForm.language || null,
        });
      } else {
        await api.post(`/social/accounts?organizationId=${$organizationIdStore}`, {
          platform: 'FACEBOOK',
          accountName: facebookForm.accountName,
          accountId: facebookForm.pageId,
          pageId: facebookForm.pageId,
          accessToken: facebookForm.accessToken,
          language: facebookForm.language || null,
          scopes: ['pages_manage_posts'],
        });
      }
      closeFacebookModal();
      await loadAccounts();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      facebookSaving = false;
    }
  }

  let editingTelegramId: string | null = null;

  function openEditTelegram(account: any) {
    editingTelegramId = account.id;
    telegramForm = {
      accountName: account.accountName || '',
      botToken: '',
      chatId: account.accountId || '',
      language: account.language || '',
    };
    showTelegramModal = true;
  }

  function closeTelegramModal() {
    showTelegramModal = false;
    editingTelegramId = null;
    telegramForm = { accountName: '', botToken: '', chatId: '', language: '' };
  }

  async function connectTelegram() {
    if (!$organizationIdStore) return;
    telegramSaving = true;
    try {
      if (editingTelegramId) {
        await api.put(`/social/accounts/${editingTelegramId}`, {
          accountName: telegramForm.accountName || telegramForm.chatId,
          accountId: telegramForm.chatId,
          botToken: telegramForm.botToken,
          chatId: telegramForm.chatId,
          language: telegramForm.language || null,
        });
      } else {
        await api.post(`/social/accounts?organizationId=${$organizationIdStore}`, {
          platform: 'TELEGRAM',
          accountName: telegramForm.accountName || telegramForm.chatId,
          accountId: telegramForm.chatId,
          botToken: telegramForm.botToken,
          chatId: telegramForm.chatId,
          language: telegramForm.language || null,
          scopes: ['send_message'],
        });
      }
      closeTelegramModal();
      await loadAccounts();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      telegramSaving = false;
    }
  }

  async function connectInstagram() {
    try {
      const result = await api.get<{ url: string }>('/meta/auth-url', { platform: 'INSTAGRAM', organizationId: $organizationIdStore });
      window.location.href = result.url;
    } catch (e: any) {
      showToast(e.message || $_('social.instagram.error'));
    }
  }

  async function connectThreads() {
    try {
      const result = await api.get<{ url: string }>('/meta/auth-url', { platform: 'THREADS', organizationId: $organizationIdStore });
      window.location.href = result.url;
    } catch (e: any) {
      showToast(e.message || $_('social.threads.error'));
    }
  }

  async function disconnectAccount(id: string) {
    try {
      await api.delete(`/social/accounts/${id}`);
      accounts = accounts.filter(a => a.id !== id);
    } catch (e: any) {
      showToast(e.message);
    } finally {
      disconnectingId = null;
    }
  }

  async function updateAccountLanguage(account: any) {
    try {
      await api.post(`/social/accounts?organizationId=${$organizationIdStore}`, {
        platform: account.platform,
        accountName: account.accountName,
        accountId: account.accountId,
        language: account.language || null,
      });
    } catch (e: any) {
      showToast(e.message);
    }
  }

  const platformIcon: Record<string, string> = {
    LINKEDIN: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
    TWITTER: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    FACEBOOK: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
    TELEGRAM: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
    INSTAGRAM: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>`,
    THREADS: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.781 3.631 2.695 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L9.295 7.575c.98-1.452 2.568-2.246 4.476-2.246h.044c3.194.02 5.097 1.978 5.287 5.388.108.046.216.094.323.143 1.504.708 2.604 1.78 3.182 3.099.806 1.837.881 4.83-1.55 7.208-1.86 1.82-4.118 2.64-7.31 2.663Zm1.036-11.564c-.318 0-.64.01-.965.027-1.84.103-2.991.95-2.928 2.157.067 1.27 1.466 1.853 2.748 1.784 1.183-.064 2.751-.524 3.013-3.727a10.49 10.49 0 0 0-1.868-.241Z"/></svg>`,
  };

  const platformColor: Record<string, string> = {
    LINKEDIN: 'text-[#0077B5] bg-[#0077B5]/10',
    TWITTER: 'text-gray-900 bg-gray-100',
    FACEBOOK: 'text-[#1877F2] bg-[#1877F2]/10',
    TELEGRAM: 'text-[#26A5E4] bg-[#26A5E4]/10',
    INSTAGRAM: 'text-[#E1306C] bg-[#E1306C]/10',
    THREADS: 'text-white bg-black',
  };
</script>

<div class="p-4 sm:p-6 max-w-4xl">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">{$_('social.title')}</h1>
    <p class="text-gray-500 text-sm mt-1">{$_('social.subtitle')}</p>
  </div>

  {#if loading}
    <div class="space-y-3">
      {#each Array(4) as _}
        <div class="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-20"></div>
      {/each}
    </div>
  {:else}
    <!-- LinkedIn -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-3">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg {platformColor['LINKEDIN']} flex items-center justify-center flex-shrink-0">
            {@html platformIcon['LINKEDIN']}
          </div>
          <div>
            <div class="font-medium text-gray-900">{$_('social.linkedin')}</div>
            <div class="text-xs text-gray-500">{$_('social.linkedinDesc')}</div>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          {#each accounts.filter(a => a.platform === 'LINKEDIN') as account}
            <div class="flex items-center gap-2">
              {#if account.profileImageUrl}
                <img src={account.profileImageUrl} alt={account.accountName} class="w-7 h-7 rounded-full" />
              {/if}
              <span class="text-sm text-gray-700 font-medium">{account.accountName}</span>
              <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{$_('social.connected')}</span>
              <select
                bind:value={account.language}
                on:change={() => updateAccountLanguage(account)}
                class="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
              >
                <option value="">{$_('social.noLanguage')}</option>
                <option value="en">English</option>
                <option value="pl">Polski</option>
                <option value="ru">Русский</option>
              </select>
              <button on:click={() => disconnectingId = account.id} class="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer">
                {$_('social.disconnect')}
              </button>
            </div>
          {/each}
          <button on:click={() => showLinkedInModal = true} class="text-sm px-4 py-2 bg-[#0077B5] text-white rounded-lg hover:bg-[#006097] transition-colors duration-150 cursor-pointer font-medium self-start">
            {accounts.some(a => a.platform === 'LINKEDIN') ? $_('social.addAnother') : $_('social.connectLinkedIn')}
          </button>
        </div>
      </div>
    </div>

    <!-- Twitter / X -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-3">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg {platformColor['TWITTER']} flex items-center justify-center flex-shrink-0">
            {@html platformIcon['TWITTER']}
          </div>
          <div>
            <div class="font-medium text-gray-900">{$_('social.twitter')}</div>
            <div class="text-xs text-gray-500">{$_('social.twitterDesc')}</div>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          {#each accounts.filter(a => a.platform === 'TWITTER') as account}
            <div class="flex items-center gap-2">
              {#if account.profileImageUrl}
                <img src={account.profileImageUrl} alt={account.accountName} class="w-7 h-7 rounded-full" />
              {/if}
              <span class="text-sm text-gray-700 font-medium">@{account.accountName}</span>
              <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{$_('social.connected')}</span>
              <select
                bind:value={account.language}
                on:change={() => updateAccountLanguage(account)}
                class="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
              >
                <option value="">{$_('social.noLanguage')}</option>
                <option value="en">English</option>
                <option value="pl">Polski</option>
                <option value="ru">Русский</option>
              </select>
              <button on:click={() => disconnectingId = account.id} class="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer">
                {$_('social.disconnect')}
              </button>
            </div>
          {/each}
          <button on:click={() => showTwitterModal = true} class="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors duration-150 cursor-pointer font-medium self-start">
            {accounts.some(a => a.platform === 'TWITTER') ? $_('social.addAnother') : $_('social.connectTwitter')}
          </button>
        </div>
      </div>
    </div>

    <!-- Facebook -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-3">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-lg {platformColor['FACEBOOK']} flex items-center justify-center flex-shrink-0">
          {@html platformIcon['FACEBOOK']}
        </div>
        <div>
          <div class="font-medium text-gray-900">{$_('social.facebook')}</div>
          <div class="text-xs text-gray-500">{$_('social.facebookDesc')}</div>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        {#each accounts.filter(a => a.platform === 'FACEBOOK') as account}
          <div class="flex flex-col gap-2 p-2.5 rounded-lg border {account.status === 'REAUTH_REQUIRED' ? 'border-orange-300 bg-orange-50' : 'border-gray-100 bg-gray-50/50'}">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                {#if account.profileImageUrl}
                  <img src={account.profileImageUrl} alt={account.accountName} class="w-7 h-7 rounded-full flex-shrink-0" />
                {/if}
                <div class="flex flex-col min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-800 font-medium truncate" title={account.accountName}>{account.accountName}</span>
                    {#if account.status === 'REAUTH_REQUIRED'}
                      <span class="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full flex-shrink-0">{$_('social.reauthRequired.badge')}</span>
                    {:else}
                      <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full flex-shrink-0">{$_('social.connected')}</span>
                    {/if}
                  </div>
                  <span class="text-xs text-gray-500 font-mono truncate" title={account.accountId}>{account.accountId}</span>
                </div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <select
                  bind:value={account.language}
                  on:change={() => updateAccountLanguage(account)}
                  class="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  <option value="">{$_('social.noLanguage')}</option>
                  <option value="en">English</option>
                  <option value="pl">Polski</option>
                  <option value="ru">Русский</option>
                </select>
                <button on:click={() => openEditFacebook(account)} class="text-xs px-3 py-1.5 border {account.status === 'REAUTH_REQUIRED' ? 'border-orange-400 text-orange-700 bg-orange-100 hover:bg-orange-200 font-medium' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'} rounded-lg transition-colors duration-150 cursor-pointer">
                  {account.status === 'REAUTH_REQUIRED' ? $_('social.reauthRequired.cta') : $_('common.edit')}
                </button>
                <button on:click={() => disconnectingId = account.id} class="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer bg-white">
                  {$_('social.disconnect')}
                </button>
              </div>
            </div>
            {#if account.status === 'REAUTH_REQUIRED'}
              <p class="text-xs text-orange-800">{$_('social.reauthRequired.description')}</p>
            {/if}
          </div>
        {/each}
        <button on:click={() => showFacebookModal = true} class="text-sm px-4 py-2 bg-[#1877F2] text-white rounded-lg hover:bg-[#1565d8] transition-colors duration-150 cursor-pointer font-medium self-start mt-1">
          {accounts.some(a => a.platform === 'FACEBOOK') ? $_('social.addAnother') : $_('social.connectFacebook')}
        </button>
      </div>
    </div>

    <!-- Instagram -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-3">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-lg {platformColor['INSTAGRAM']} flex items-center justify-center flex-shrink-0">
          {@html platformIcon['INSTAGRAM']}
        </div>
        <div>
          <div class="font-medium text-gray-900">Instagram</div>
          <div class="text-xs text-gray-500">{$_('social.instagram.description')}</div>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        {#each accounts.filter(a => a.platform === 'INSTAGRAM') as account}
          <div class="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-gray-100 bg-gray-50/50">
            <div class="flex items-center gap-2 min-w-0">
              {#if account.profileImageUrl}
                <img src={account.profileImageUrl} alt={account.accountName} class="w-7 h-7 rounded-full flex-shrink-0" />
              {/if}
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-800 font-medium truncate" title={account.accountName}>{account.accountName}</span>
                  <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full flex-shrink-0">{$_('social.connected')}</span>
                </div>
                <span class="text-xs text-gray-500 font-mono truncate" title={account.accountId}>{account.accountId}</span>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <select
                bind:value={account.language}
                on:change={() => updateAccountLanguage(account)}
                class="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
              >
                <option value="">{$_('social.noLanguage')}</option>
                <option value="en">English</option>
                <option value="pl">Polski</option>
                <option value="ru">Русский</option>
              </select>
              <button on:click={() => disconnectingId = account.id} class="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer bg-white">
                {$_('social.disconnect')}
              </button>
            </div>
          </div>
        {/each}
        <button on:click={connectInstagram} class="text-sm px-4 py-2 bg-[#E1306C] text-white rounded-lg hover:bg-[#c1255a] transition-colors duration-150 cursor-pointer font-medium self-start mt-1">
          {accounts.some(a => a.platform === 'INSTAGRAM') ? $_('social.addAnother') : $_('social.instagram.connect')}
        </button>
      </div>
    </div>

    <!-- Threads -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-3">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-lg {platformColor['THREADS']} flex items-center justify-center flex-shrink-0">
          {@html platformIcon['THREADS']}
        </div>
        <div>
          <div class="font-medium text-gray-900">Threads</div>
          <div class="text-xs text-gray-500">{$_('social.threads.description')}</div>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        {#each accounts.filter(a => a.platform === 'THREADS') as account}
          <div class="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-gray-100 bg-gray-50/50">
            <div class="flex items-center gap-2 min-w-0">
              {#if account.profileImageUrl}
                <img src={account.profileImageUrl} alt={account.accountName} class="w-7 h-7 rounded-full flex-shrink-0" />
              {/if}
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-800 font-medium truncate" title={account.accountName}>{account.accountName}</span>
                  <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full flex-shrink-0">{$_('social.connected')}</span>
                </div>
                <span class="text-xs text-gray-500 font-mono truncate" title={account.accountId}>{account.accountId}</span>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <select
                bind:value={account.language}
                on:change={() => updateAccountLanguage(account)}
                class="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
              >
                <option value="">{$_('social.noLanguage')}</option>
                <option value="en">English</option>
                <option value="pl">Polski</option>
                <option value="ru">Русский</option>
              </select>
              <button on:click={() => disconnectingId = account.id} class="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer bg-white">
                {$_('social.disconnect')}
              </button>
            </div>
          </div>
        {/each}
        <button on:click={connectThreads} class="text-sm px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors duration-150 cursor-pointer font-medium self-start mt-1">
          {accounts.some(a => a.platform === 'THREADS') ? $_('social.addAnother') : $_('social.threads.connect')}
        </button>
      </div>
    </div>

    <!-- Telegram -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-3">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-lg {platformColor['TELEGRAM']} flex items-center justify-center flex-shrink-0">
          {@html platformIcon['TELEGRAM']}
        </div>
        <div>
          <div class="font-medium text-gray-900">{$_('social.telegram')}</div>
          <div class="text-xs text-gray-500">{$_('social.telegramDesc')}</div>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        {#each accounts.filter(a => a.platform === 'TELEGRAM') as account}
          <div class="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-gray-100 bg-gray-50/50">
            <div class="flex items-center gap-2 min-w-0">
              {#if account.profileImageUrl}
                <img src={account.profileImageUrl} alt={account.accountName} class="w-7 h-7 rounded-full flex-shrink-0" />
              {/if}
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-800 font-medium truncate" title={account.accountName}>{account.accountName}</span>
                  <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full flex-shrink-0">{$_('social.connected')}</span>
                </div>
                <span class="text-xs text-gray-500 font-mono truncate" title={account.accountId}>{account.accountId}</span>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <select
                bind:value={account.language}
                on:change={() => updateAccountLanguage(account)}
                class="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
              >
                <option value="">{$_('social.noLanguage')}</option>
                <option value="en">English</option>
                <option value="pl">Polski</option>
                <option value="ru">Русский</option>
              </select>
              <button on:click={() => openEditTelegram(account)} class="text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-150 cursor-pointer bg-white">
                {$_('common.edit')}
              </button>
              <button on:click={() => disconnectingId = account.id} class="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer bg-white">
                {$_('social.disconnect')}
              </button>
            </div>
          </div>
        {/each}
        <button on:click={() => showTelegramModal = true} class="text-sm px-4 py-2 bg-[#26A5E4] text-white rounded-lg hover:bg-[#1e8ec4] transition-colors duration-150 cursor-pointer font-medium self-start mt-1">
          {accounts.some(a => a.platform === 'TELEGRAM') ? $_('social.addAnother') : $_('social.connectTelegram')}
        </button>
      </div>
    </div>
  {/if}
</div>

<!-- LinkedIn credentials modal -->
{#if showLinkedInModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showLinkedInModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100">
        <div class="flex items-center gap-2.5 mb-1">
          <div class="w-8 h-8 bg-[#0077B5]/10 rounded-lg flex items-center justify-center flex-shrink-0 text-[#0077B5]">
            {@html platformIcon['LINKEDIN']}
          </div>
          <h2 class="text-lg font-semibold text-gray-900">{$_('social.linkedinManualTitle')}</h2>
        </div>
        <p class="text-sm text-gray-500 ml-10">{$_('social.linkedinManualDesc')}</p>
      </div>
      <div class="p-6 space-y-3">
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">{$_('social.accountName')}</label>
          <input type="text" bind:value={linkedInForm.accountName} placeholder="John Doe" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">{$_('social.linkedinPersonUrn')} <span class="text-gray-400 font-normal">(Person ID)</span></label>
          <input type="text" bind:value={linkedInForm.accountId} placeholder="ABC123xyz" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <p class="text-xs text-gray-400 mt-1">{$_('social.linkedinPersonUrnHint')}</p>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">{$_('social.accessToken')}</label>
          <input type="password" bind:value={linkedInForm.accessToken} placeholder="AQV..." class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <p class="text-xs text-amber-600 mt-1.5 flex items-start gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {$_('social.linkedinTokenHint')}
          </p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{$_('social.accountLanguage')}</label>
          <select bind:value={linkedInForm.language} class="w-full border border-gray-300 rounded-lg px-3 py-2">
            <option value="">{$_('social.noLanguage')}</option>
            <option value="en">English</option>
            <option value="pl">Polski</option>
            <option value="ru">Русский</option>
          </select>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={connectLinkedIn}
          disabled={linkedInSaving || !linkedInForm.accountName || !linkedInForm.accountId || !linkedInForm.accessToken}
          class="flex-1 bg-[#0077B5] text-white py-2.5 rounded-lg font-medium hover:bg-[#006097] transition-colors duration-150 disabled:opacity-50 text-sm cursor-pointer"
        >
          {linkedInSaving ? $_('common.loading') : $_('social.connect')}
        </button>
        <button on:click={() => showLinkedInModal = false} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Twitter credentials modal -->
{#if showTwitterModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showTwitterModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100">
        <div class="flex items-center gap-2.5 mb-1">
          <div class="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
            {@html platformIcon['TWITTER']}
          </div>
          <h2 class="text-lg font-semibold text-gray-900">{$_('social.twitterManualTitle')}</h2>
        </div>
        <p class="text-sm text-gray-500 ml-10">{$_('social.twitterManualDesc')}</p>
      </div>
      <div class="p-6 space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">{$_('social.accountName')}</label>
            <input type="text" bind:value={twitterForm.accountName} placeholder="@username" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">{$_('social.accountId')}</label>
            <input type="text" bind:value={twitterForm.accountId} placeholder="123456789" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">{$_('social.appKey')}</label>
          <input type="password" bind:value={twitterForm.appKey} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">{$_('social.appSecret')}</label>
          <input type="password" bind:value={twitterForm.appSecret} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">{$_('social.accessToken')}</label>
          <input type="password" bind:value={twitterForm.accessToken} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">{$_('social.accessSecret')}</label>
          <input type="password" bind:value={twitterForm.accessSecret} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{$_('social.accountLanguage')}</label>
          <select bind:value={twitterForm.language} class="w-full border border-gray-300 rounded-lg px-3 py-2">
            <option value="">{$_('social.noLanguage')}</option>
            <option value="en">English</option>
            <option value="pl">Polski</option>
            <option value="ru">Русский</option>
          </select>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={connectTwitter}
          disabled={twitterSaving || !twitterForm.accountName || !twitterForm.accountId || !twitterForm.appKey || !twitterForm.appSecret || !twitterForm.accessToken || !twitterForm.accessSecret}
          class="flex-1 bg-gray-900 text-white py-2.5 rounded-lg font-medium hover:bg-gray-700 transition-colors duration-150 disabled:opacity-50 text-sm cursor-pointer"
        >
          {twitterSaving ? $_('common.loading') : $_('social.connect')}
        </button>
        <button on:click={() => showTwitterModal = false} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Facebook credentials modal -->
{#if showFacebookModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={closeFacebookModal}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100">
        <div class="flex items-center gap-2.5 mb-1">
          <div class="w-8 h-8 bg-[#1877F2]/10 rounded-lg flex items-center justify-center flex-shrink-0 text-[#1877F2]">
            {@html platformIcon['FACEBOOK']}
          </div>
          <h2 class="text-lg font-semibold text-gray-900">{$_('social.facebookManualTitle')}</h2>
        </div>
        <p class="text-sm text-gray-500 ml-10">{$_('social.facebookManualDesc')}</p>
      </div>
      <div class="p-6 space-y-3">
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">{$_('social.facebookPageName')}</label>
          <input type="text" bind:value={facebookForm.accountName} placeholder="My Business Page" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">{$_('social.facebookPageId')}</label>
          <input type="text" bind:value={facebookForm.pageId} placeholder="123456789012345" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <p class="text-xs text-gray-400 mt-1">{$_('social.facebookPageIdHint')}</p>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">
            {$_('social.facebookPageToken')}
            {#if editingFacebookId}<span class="text-gray-400 font-normal">({$_('social.leaveBlankToKeep')})</span>{/if}
          </label>
          <input type="password" bind:value={facebookForm.accessToken} placeholder="EAABsbC..." class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <p class="text-xs text-amber-600 mt-1.5 flex items-start gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {$_('social.facebookTokenHint')}
          </p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{$_('social.accountLanguage')}</label>
          <select bind:value={facebookForm.language} class="w-full border border-gray-300 rounded-lg px-3 py-2">
            <option value="">{$_('social.noLanguage')}</option>
            <option value="en">English</option>
            <option value="pl">Polski</option>
            <option value="ru">Русский</option>
          </select>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={connectFacebook}
          disabled={facebookSaving || !facebookForm.accountName || !facebookForm.pageId || (!editingFacebookId && !facebookForm.accessToken)}
          class="flex-1 bg-[#1877F2] text-white py-2.5 rounded-lg font-medium hover:bg-[#1565d8] transition-colors duration-150 disabled:opacity-50 text-sm cursor-pointer"
        >
          {facebookSaving ? $_('common.loading') : (editingFacebookId ? $_('common.save') : $_('social.connect'))}
        </button>
        <button on:click={closeFacebookModal} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Telegram credentials modal -->
{#if showTelegramModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={closeTelegramModal}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100">
        <div class="flex items-center gap-2.5 mb-1">
          <div class="w-8 h-8 rounded-lg {platformColor['TELEGRAM']} flex items-center justify-center flex-shrink-0">
            {@html platformIcon['TELEGRAM']}
          </div>
          <h2 class="text-lg font-semibold text-gray-900">{$_('social.telegramManualTitle')}</h2>
        </div>
        <p class="text-sm text-gray-500 ml-10">{$_('social.telegramManualDesc')}</p>
      </div>
      <div class="p-6 space-y-3">
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">{$_('social.accountName')} <span class="text-gray-400 font-normal">(optional)</span></label>
          <input type="text" bind:value={telegramForm.accountName} placeholder="My Marketing Channel" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">
            {$_('social.botToken')}
            {#if editingTelegramId}<span class="text-gray-400 font-normal">({$_('social.leaveBlankToKeep')})</span>{/if}
          </label>
          <input type="password" bind:value={telegramForm.botToken} placeholder="1234567890:ABCdefGHIjklMNOpqrstUVwxyz" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-700 mb-1">{$_('social.chatId')}</label>
          <input type="text" bind:value={telegramForm.chatId} placeholder={$_('social.chatIdPlaceholder')} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <p class="text-xs text-amber-600 mt-1.5 flex items-start gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {$_('social.telegramBotHint')}
          </p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{$_('social.accountLanguage')}</label>
          <select bind:value={telegramForm.language} class="w-full border border-gray-300 rounded-lg px-3 py-2">
            <option value="">{$_('social.noLanguage')}</option>
            <option value="en">English</option>
            <option value="pl">Polski</option>
            <option value="ru">Русский</option>
          </select>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={connectTelegram}
          disabled={telegramSaving || !telegramForm.chatId || (!editingTelegramId && !telegramForm.botToken)}
          class="flex-1 bg-[#26A5E4] text-white py-2.5 rounded-lg font-medium hover:bg-[#1e8ec4] transition-colors duration-150 disabled:opacity-50 text-sm cursor-pointer"
        >
          {telegramSaving ? $_('common.loading') : (editingTelegramId ? $_('common.save') : $_('social.connect'))}
        </button>
        <button on:click={closeTelegramModal} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Disconnect confirm modal -->
{#if disconnectingId}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => disconnectingId = null}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <div class="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.181 8.68a4.503 4.503 0 0 1 1.903 6.405m-9.768-3.782L3 6.757l4.416-1.596m6.784 9.645L10.632 18l-4.416-1.596m9.963-3.782a4.503 4.503 0 0 1-8.271-1.15" />
        </svg>
      </div>
      <h2 class="text-lg font-semibold text-gray-900 mb-1">{$_('social.disconnectConfirm')}</h2>
      <p class="text-sm text-gray-500 mb-6">{$_('social.disconnectDesc')}</p>
      <div class="flex gap-3">
        <button
          on:click={() => disconnectAccount(disconnectingId!)}
          class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors duration-150 text-sm cursor-pointer"
        >
          {$_('social.disconnect')}
        </button>
        <button on:click={() => disconnectingId = null} class="flex-1 px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Toast notification -->
{#if toast}
  <div class="fixed bottom-6 right-6 z-[60] max-w-sm">
    <div class="flex items-start gap-3 rounded-xl shadow-lg border px-4 py-3 text-sm
      {toast.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
       toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
       'bg-red-50 border-red-200 text-red-800'}">
      {#if toast.type === 'warning'}
        <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 w-4 h-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      {:else if toast.type === 'success'}
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
        on:click={() => toast = null}
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
