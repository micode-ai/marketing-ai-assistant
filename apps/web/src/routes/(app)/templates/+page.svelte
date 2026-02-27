<script lang="ts">
  import { _ } from 'svelte-i18n';

  $: templates = [
    { icon: '🚀', nameKey: 'templates.productLaunch', type: 'checklist', descKey: 'templates.productLaunchDesc' },
    { icon: '📧', nameKey: 'templates.emailCampaign', type: 'checklist', descKey: 'templates.emailCampaignDesc' },
    { icon: '📊', nameKey: 'templates.marketingPlan', type: 'document', descKey: 'templates.marketingPlanDesc' },
    { icon: '🔍', nameKey: 'templates.seoAudit', type: 'checklist', descKey: 'templates.seoAuditDesc' },
    { icon: '📱', nameKey: 'templates.socialMediaLaunch', type: 'checklist', descKey: 'templates.socialMediaLaunchDesc' },
    { icon: '📈', nameKey: 'templates.performanceReport', type: 'document', descKey: 'templates.performanceReportDesc' },
    { icon: '🎯', nameKey: 'templates.campaignPrep', type: 'checklist', descKey: 'templates.campaignPrepDesc' },
    { icon: '🔍', nameKey: 'templates.competitiveAnalysis', type: 'document', descKey: 'templates.competitiveAnalysisDesc' },
  ];
</script>

<div class="p-6">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">{$_('nav.templates')}</h1>
    <p class="text-gray-500 mt-1 text-sm">{$_('templates.subtitle')}</p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {#each templates as t}
      <div class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-primary-200 transition-all cursor-pointer group">
        <div class="text-3xl mb-3">{t.icon}</div>
        <h3 class="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">{$_(t.nameKey)}</h3>
        <p class="text-xs text-gray-500 mt-1 mb-3">{$_(t.descKey)}</p>
        <span class="text-xs px-2 py-1 rounded {t.type === 'checklist' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}">
          {$_('templates.' + t.type)}
        </span>
      </div>
    {/each}
  </div>
</div>
