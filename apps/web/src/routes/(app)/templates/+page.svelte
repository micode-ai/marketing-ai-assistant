<script lang="ts">
  import { _ } from 'svelte-i18n';

  $: templates = [
    {
      nameKey: 'templates.productLaunch',
      type: 'checklist',
      descKey: 'templates.productLaunchDesc',
      color: 'text-violet-600 bg-violet-50',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>`,
    },
    {
      nameKey: 'templates.emailCampaign',
      type: 'checklist',
      descKey: 'templates.emailCampaignDesc',
      color: 'text-blue-600 bg-blue-50',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>`,
    },
    {
      nameKey: 'templates.marketingPlan',
      type: 'document',
      descKey: 'templates.marketingPlanDesc',
      color: 'text-green-600 bg-green-50',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>`,
    },
    {
      nameKey: 'templates.seoAudit',
      type: 'checklist',
      descKey: 'templates.seoAuditDesc',
      color: 'text-orange-600 bg-orange-50',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.804 7.5 7.5 0 0015.803 15.803z" /></svg>`,
    },
    {
      nameKey: 'templates.socialMediaLaunch',
      type: 'checklist',
      descKey: 'templates.socialMediaLaunchDesc',
      color: 'text-pink-600 bg-pink-50',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>`,
    },
    {
      nameKey: 'templates.performanceReport',
      type: 'document',
      descKey: 'templates.performanceReportDesc',
      color: 'text-indigo-600 bg-indigo-50',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>`,
    },
    {
      nameKey: 'templates.campaignPrep',
      type: 'checklist',
      descKey: 'templates.campaignPrepDesc',
      color: 'text-red-600 bg-red-50',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
    },
    {
      nameKey: 'templates.competitiveAnalysis',
      type: 'document',
      descKey: 'templates.competitiveAnalysisDesc',
      color: 'text-slate-600 bg-slate-50',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>`,
    },
  ];
</script>

<div class="p-6">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">{$_('nav.templates')}</h1>
    <p class="text-gray-500 mt-1 text-sm">{$_('templates.subtitle')}</p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {#each templates as t}
      <div class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-primary-200 transition-all duration-200 cursor-pointer group flex flex-col">
        <div class="w-11 h-11 {t.color} rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-200">
          {@html t.icon}
        </div>
        <h3 class="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors duration-150">{$_(t.nameKey)}</h3>
        <p class="text-xs text-gray-500 mt-1 mb-3 flex-1">{$_(t.descKey)}</p>
        <div class="flex items-center justify-between">
          <span class="text-xs px-2 py-1 rounded-full {t.type === 'checklist' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}">
            {$_('templates.' + t.type)}
          </span>
          <svg class="w-4 h-4 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all duration-150" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </div>
    {/each}
  </div>
</div>
