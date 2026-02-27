<script lang="ts">
  import { page } from '$app/stores';
  import { _ } from 'svelte-i18n';
  import { currentProjectStore } from '$lib/stores/projects';

  export let open = true;

  const mainLinks = [
    { href: '/dashboard', icon: '🏠', labelKey: 'nav.dashboard' },
    { href: '/projects', icon: '📁', labelKey: 'nav.projects' },
    { href: '/ai-chat', icon: '🤖', labelKey: 'nav.aiChat' },
    { href: '/templates', icon: '📋', labelKey: 'nav.templates' },
  ];

  const settingsLinks = [
    { href: '/settings/organization', icon: '🏢', labelKey: 'nav.settings' },
    { href: '/settings/billing', icon: '💳', labelKey: 'nav.billing' },
    { href: '/settings/team', icon: '👥', labelKey: 'nav.team' },
    { href: '/settings/email-accounts', icon: '📧', labelKey: 'nav.emailAccounts' },
  ];

  const projectSubLinks = [
    { path: 'overview', icon: '📊', labelKey: 'projects.overview' },
    { path: 'campaigns', icon: '🚀', labelKey: 'projects.campaigns' },
    { path: 'content', icon: '✍️', labelKey: 'projects.content' },
    { path: 'email', icon: '📧', labelKey: 'projects.email' },
    { path: 'checklists', icon: '✅', labelKey: 'projects.checklists' },
    { path: 'documents', icon: '📄', labelKey: 'projects.documents' },
    { path: 'analytics', icon: '📈', labelKey: 'projects.analytics' },
    { path: 'calendar', icon: '📅', labelKey: 'projects.calendar' },
  ];

  $: currentPath = $page.url.pathname;
  $: projectId = $currentProjectStore?.id;

  function isActive(href: string) {
    return currentPath === href || currentPath.startsWith(href + '/');
  }
</script>

{#if open}
  <aside class="w-64 bg-white border-r border-gray-200 flex flex-col h-full overflow-y-auto flex-shrink-0">
    <!-- Logo -->
    <div class="p-5 border-b border-gray-100">
      <a href="/dashboard" class="flex items-center gap-2.5">
        <div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">M</div>
        <div>
          <div class="font-bold text-gray-900 text-sm leading-none">Marketing AI</div>
          <div class="text-xs text-gray-400 mt-0.5">Assistant</div>
        </div>
      </a>
    </div>

    <nav class="p-3 flex-1 space-y-6">
      <!-- Main nav -->
      <div>
        <ul class="space-y-0.5">
          {#each mainLinks as link}
            <li>
              <a href={link.href} class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors {isActive(link.href) ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}">
                <span class="text-base w-5 text-center">{link.icon}</span>
                <span>{$_(link.labelKey)}</span>
              </a>
            </li>
          {/each}
        </ul>
      </div>

      <!-- Current project nav -->
      {#if $currentProjectStore && projectId}
        <div>
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2 truncate" title={$currentProjectStore.name}>
            {$currentProjectStore.name}
          </p>
          <ul class="space-y-0.5">
            {#each projectSubLinks as link}
              {@const href = `/projects/${projectId}/${link.path}`}
              <li>
                <a href={href} class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors {currentPath === href ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}">
                  <span class="text-base w-5 text-center">{link.icon}</span>
                  <span>{$_(link.labelKey)}</span>
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Settings -->
      <div>
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">{$_('common.settings')}</p>
        <ul class="space-y-0.5">
          {#each settingsLinks as link}
            <li>
              <a href={link.href} class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors {isActive(link.href) ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}">
                <span class="text-base w-5 text-center">{link.icon}</span>
                <span>{$_(link.labelKey)}</span>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    </nav>
  </aside>
{/if}
