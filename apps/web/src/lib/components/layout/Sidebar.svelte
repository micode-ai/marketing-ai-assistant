<script lang="ts">
  import { page } from '$app/stores';
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { currentProjectStore, organizationIdStore } from '$lib/stores/projects';
  import { authStore, currentUser } from '$lib/stores/auth';
  import { api } from '$lib/api/client';
  import { browser } from '$app/environment';

  export let open = true;
  export let isMobile = false;

  function logout() {
    authStore.logout();
    goto('/login');
  }

  // Theme toggle
  let isDark = browser ? document.documentElement.classList.contains('dark') : false;

  function toggleTheme() {
    isDark = !isDark;
    if (browser) {
      document.documentElement.classList.toggle('dark', isDark);
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }
  }

  $: memberships = ($currentUser as any)?.memberships || [];
  $: currentOrg = memberships.find((m: any) => m.organization?.id === $organizationIdStore)?.organization;
  $: hasMultipleOrgs = memberships.length > 1;
  let showOrgDropdown = false;

  function switchOrg(orgId: string) {
    organizationIdStore.set(orgId);
    showOrgDropdown = false;
    currentProjectStore.set(null);
    window.location.href = '/dashboard';
  }

  let leavingOrg: any = null;

  async function leaveOrg() {
    if (!leavingOrg) return;
    try {
      await api.post(`/organizations/${leavingOrg.organization.id}/leave`);
      leavingOrg = null;
      showOrgDropdown = false;
      currentProjectStore.set(null);
      organizationIdStore.set(null);
      window.location.href = '/dashboard';
    } catch {
      leavingOrg = null;
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (showOrgDropdown) showOrgDropdown = false;
  }

  // Heroicons outline 24px — stored as SVG strings for {@html} rendering
  // Consistent with existing {@html action.icon} pattern in overview/+page.svelte
  const icons: Record<string, string> = {
    home: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>`,
    folder: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>`,
    sparkles: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>`,
    clipboard: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>`,
    building: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>`,
    creditcard: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" /></svg>`,
    banknotes: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>`,
    users: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>`,
    envelope: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>`,
    link: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>`,
    chartbar: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>`,
    megaphone: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 1 8.835-2.535m0 0A23.74 23.74 0 0 1 18.795 3c1.168 0 2.316.08 3.443.238.562.085.99.566.99 1.14V19.5c0 .564-.427 1.044-.989 1.129a23.95 23.95 0 0 1-3.444.238 23.844 23.844 0 0 1-1.02-.04m0-17.38V3m0 0h-3.614" /></svg>`,
    pencil: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>`,
    checkcircle: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`,
    document: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>`,
    presentation: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" /></svg>`,
    calendar: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>`,
    globe: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>`,
    beaker: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>`,
    mailstack: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M7.875 14.25l1.214 1.942a2.25 2.25 0 0 0 1.908 1.058h2.006c.776 0 1.497-.4 1.908-1.058l1.214-1.942M2.41 9h4.636a2.25 2.25 0 0 1 1.872 1.002l.164.246a2.25 2.25 0 0 0 1.872 1.002h2.092a2.25 2.25 0 0 0 1.872-1.002l.164-.246A2.25 2.25 0 0 1 16.954 9h4.636M2.41 9a2.25 2.25 0 0 0-.16.832V12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 12V9.832c0-.287-.055-.569-.16-.832M2.41 9a2.25 2.25 0 0 1 .382-.632l3.285-3.832A2.25 2.25 0 0 1 7.793 3.75h8.414a2.25 2.25 0 0 1 1.716.796l3.285 3.832c.163.19.291.404.382.632M4.5 20.25h15A2.25 2.25 0 0 0 21.75 18v-2.625c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125V18a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>`,
    eye: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>`,
    webhook: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" /></svg>`,
    questionmark: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" /></svg>`,
  };

  const mainLinks = [
    { href: '/dashboard', iconKey: 'home', labelKey: 'nav.dashboard' },
    { href: '/projects', iconKey: 'folder', labelKey: 'nav.projects' },
    { href: '/ai-chat', iconKey: 'sparkles', labelKey: 'nav.aiChat' },
    { href: '/templates', iconKey: 'clipboard', labelKey: 'nav.templates' },
  ];

  const marketingLinks = [
    { href: '/content',     iconKey: 'pencil',       labelKey: 'nav.orgContent' },
    { href: '/checklists',  iconKey: 'checkcircle',  labelKey: 'nav.orgChecklists' },
    { href: '/documents',   iconKey: 'document',     labelKey: 'nav.orgDocuments' },
    { href: '/campaigns',   iconKey: 'megaphone',    labelKey: 'nav.orgCampaigns' },
    { href: '/email',       iconKey: 'envelope',     labelKey: 'nav.orgEmail' },
    { href: '/analytics',   iconKey: 'presentation', labelKey: 'nav.orgAnalytics' },
    { href: '/finances',    iconKey: 'banknotes',    labelKey: 'nav.orgFinances' },
  ];

  const advancedMarketingLinks = [
    { href: '/seo',         iconKey: 'globe',         labelKey: 'nav.orgSeo' },
    { href: '/competitors', iconKey: 'eye',           labelKey: 'nav.orgCompetitors' },
    { href: '/experiments', iconKey: 'beaker',        labelKey: 'nav.orgExperiments' },
    { href: '/sequences',   iconKey: 'mailstack',     labelKey: 'nav.orgSequences' },
    { href: '/calendar',    iconKey: 'calendar',      labelKey: 'nav.orgCalendar' },
  ];

  const settingsLinks = [
    { href: '/settings/organization', iconKey: 'building', labelKey: 'nav.settings' },
    { href: '/settings/billing', iconKey: 'creditcard', labelKey: 'nav.billing' },
    { href: '/settings/team', iconKey: 'users', labelKey: 'nav.team' },
    { href: '/settings/email-accounts', iconKey: 'envelope', labelKey: 'nav.emailAccounts' },
    { href: '/settings/integrations', iconKey: 'link', labelKey: 'nav.integrations' },
    { href: '/settings/webhooks', iconKey: 'webhook', labelKey: 'nav.webhooks' },
  ];


  let showAdvanced = browser ? localStorage.getItem('sidebarAdvanced') === 'true' : false;

  function toggleAdvanced() {
    showAdvanced = !showAdvanced;
    if (browser) localStorage.setItem('sidebarAdvanced', String(showAdvanced));
  }

  $: currentPath = $page.url.pathname;

  const marketingPathSegments = ['content', 'checklists', 'documents', 'campaigns', 'email', 'analytics', 'finances', 'seo', 'competitors', 'experiments', 'sequences', 'calendar'];

  function isActive(href: string, path: string = currentPath): boolean {
    if (path === href || path.startsWith(href + '/')) return true;
    const segment = href.replace('/', '');
    if (marketingPathSegments.includes(segment)) {
      const projectRouteMatch = path.match(/^\/projects\/[^/]+\/(.+)/);
      if (projectRouteMatch) {
        const subPath = projectRouteMatch[1].split('/')[0];
        return subPath === segment;
      }
    }
    return false;
  }

  // Auto-expand advanced section when navigating to an advanced route
  $: {
    const advancedHrefs = advancedMarketingLinks.map(l => l.href);
    const isOnAdvanced = advancedHrefs.some(h => isActive(h, currentPath));
    if (isOnAdvanced && !showAdvanced) {
      showAdvanced = true;
      if (browser) localStorage.setItem('sidebarAdvanced', 'true');
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<svelte:window on:click={handleClickOutside} />

<!-- Sidebar: uses inline style width transition for smooth slide animation -->
<aside
  class="bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden flex-shrink-0 transition-[width,transform] duration-200 ease-in-out
    {isMobile ? 'fixed inset-y-0 left-0 z-40 w-64' : ''}"
  style={isMobile ? `transform: translateX(${open ? '0' : '-100%'});` : `width: ${open ? '16rem' : '0'};`}
  aria-hidden={!open}
>
  <!-- Inner wrapper prevents content from reflowing during width transition -->
  <div class="w-64 flex flex-col h-full overflow-y-auto custom-scroll">
    <!-- Logo -->
    <div class="p-5 border-b border-gray-100 flex-shrink-0">
      <a href="/dashboard" class="flex items-center gap-2.5 group cursor-pointer">
        <!-- SparklesIcon badge — more distinctive than plain "M" letter -->
        <div class="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-primary-200 transition-shadow duration-200">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
        </div>
        <div>
          <div class="font-bold text-gray-900 text-sm leading-none" style="font-family: 'Space Grotesk', sans-serif;">Marketing AI</div>
          <div class="text-xs text-gray-400 mt-0.5">Assistant</div>
        </div>
      </a>
    </div>

    <!-- Organization switcher -->
    {#if hasMultipleOrgs}
      <div class="px-4 py-3 border-b border-gray-100 relative">
        <button
          on:click|stopPropagation={() => (showOrgDropdown = !showOrgDropdown)}
          class="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
        >
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-6 h-6 rounded bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-bold flex-shrink-0">
              {(currentOrg?.name || '?').charAt(0).toUpperCase()}
            </div>
            <span class="text-sm font-medium text-gray-700 truncate">{currentOrg?.name || ''}</span>
          </div>
          <svg class="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-150 {showOrgDropdown ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {#if showOrgDropdown}
          <div class="absolute left-3 right-3 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
            {#each memberships as m}
              <div class="flex items-center hover:bg-gray-50 transition-colors duration-150">
                <button
                  on:click={() => switchOrg(m.organization.id)}
                  class="flex-1 text-left px-3 py-2 text-sm flex items-center gap-2 cursor-pointer
                    {m.organization.id === $organizationIdStore ? 'text-primary-700 font-medium' : 'text-gray-600'}"
                >
                  <div class="w-5 h-5 rounded bg-primary-100 flex items-center justify-center text-primary-700 text-[10px] font-bold flex-shrink-0">
                    {(m.organization.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <span class="truncate">{m.organization.name}</span>
                  {#if m.organization.id === $organizationIdStore}
                    <svg class="w-4 h-4 text-primary-600 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  {/if}
                </button>
                {#if m.role !== 'OWNER'}
                  <button
                    on:click|stopPropagation={() => (leavingOrg = m)}
                    class="px-2 py-1 mr-2 text-red-400 hover:text-red-600 cursor-pointer flex-shrink-0"
                    title={$_('settings.leaveTeam')}
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                    </svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <nav class="p-3 flex-1 space-y-6">
      <!-- Main navigation -->
      <div>
        <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-2">Navigation</p>
        <ul class="space-y-0.5">
          {#each mainLinks as link}
            <li>
              <a
                href={link.href}
                class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer
                  {isActive(link.href, currentPath)
                    ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-2 border-transparent'}"
              >
                {@html icons[link.iconKey]}
                <span>{$_(link.labelKey)}</span>
              </a>
            </li>
          {/each}
        </ul>
      </div>

      <!-- Marketing -->
      <div>
        <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-2">{$_('nav.marketing')}</p>
        <ul class="space-y-0.5">
          <!-- Overview — only when project selected -->
          {#if $currentProjectStore}
            {@const overviewHref = `/projects/${$currentProjectStore.id}/overview`}
            <li>
              <a
                href={overviewHref}
                class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer
                  {currentPath === overviewHref || currentPath.startsWith(overviewHref)
                    ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-2 border-transparent'}"
              >
                {@html icons['chartbar']}
                <span>{$_('projects.overview')}</span>
              </a>
            </li>
          {/if}

          {#each marketingLinks as link}
            <li>
              <a
                href={link.href}
                class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer
                  {isActive(link.href, currentPath)
                    ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-2 border-transparent'}"
              >
                {@html icons[link.iconKey]}
                <span>{$_(link.labelKey)}</span>
              </a>
            </li>
          {/each}

          <!-- Advanced toggle -->
          <li>
            <button
              on:click={toggleAdvanced}
              class="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-600 cursor-pointer transition-colors duration-150 mt-1"
            >
              <span>{showAdvanced ? $_('nav.hideAdvanced') : $_('nav.showAdvanced')}</span>
              <svg
                class="w-3.5 h-3.5 transition-transform duration-200 {showAdvanced ? 'rotate-180' : ''}"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </li>

          {#if showAdvanced}
            {#each advancedMarketingLinks as link}
              <li>
                <a
                  href={link.href}
                  class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer
                    {isActive(link.href, currentPath)
                      ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-2 border-transparent'}"
                >
                  {@html icons[link.iconKey]}
                  <span>{$_(link.labelKey)}</span>
                </a>
              </li>
            {/each}
          {/if}
        </ul>
      </div>

      <!-- Settings -->
      <div>
        <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-2">{$_('common.settings')}</p>
        <ul class="space-y-0.5">
          {#each settingsLinks as link}
            <li>
              <a
                href={link.href}
                class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer
                  {isActive(link.href, currentPath)
                    ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-2 border-transparent'}"
              >
                {@html icons[link.iconKey]}
                <span>{$_(link.labelKey)}</span>
              </a>
            </li>
          {/each}
        </ul>
      </div>

      <!-- User profile + logout -->
      {#if $currentUser}
        <div class="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-2.5 px-3 py-2">
            <div class="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 select-none">
              {$currentUser.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 truncate">{$currentUser.name}</div>
              {#if $currentUser.email}
                <div class="text-xs text-gray-400 truncate">{$currentUser.email}</div>
              {/if}
            </div>
            <button
              on:click={logout}
              class="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors duration-150 cursor-pointer flex-shrink-0"
              title={$_('auth.logout')}
              aria-label={$_('auth.logout')}
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      {/if}

      <!-- Theme Toggle + Help -->
      <div class="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
        <button
          on:click={toggleTheme}
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-150 w-full text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white cursor-pointer"
        >
          {#if isDark}
            <svg class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>
            <span>{$_('nav.lightMode') || 'Light Mode'}</span>
          {:else}
            <svg class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>
            <span>{$_('nav.darkMode') || 'Dark Mode'}</span>
          {/if}
        </button>
        <a href="/help"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-150
            {$page.url.pathname.startsWith('/help') ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}">
          {@html icons.questionmark}
          <span>{$_('nav.help')}</span>
        </a>
      </div>
    </nav>
  </div>
</aside>

<!-- Leave Organization Modal -->
{#if leavingOrg}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => (leavingOrg = null)}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <div class="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-4">
        <svg class="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
        </svg>
      </div>
      <h2 class="text-lg font-semibold text-gray-900 mb-1">{$_('settings.leaveTeamConfirm')}</h2>
      <p class="text-sm text-gray-500 mb-1 font-medium">{leavingOrg.organization?.name}</p>
      <p class="text-sm text-gray-500 mb-6">{$_('settings.leaveTeamDesc')}</p>
      <div class="flex gap-3">
        <button
          on:click={leaveOrg}
          class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-red-700 transition-colors duration-150 cursor-pointer"
        >
          {$_('settings.leaveTeam')}
        </button>
        <button
          on:click={() => (leavingOrg = null)}
          class="flex-1 border border-gray-300 rounded-lg text-sm py-2.5 font-medium hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
