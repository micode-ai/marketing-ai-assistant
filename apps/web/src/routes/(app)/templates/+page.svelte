<script lang="ts">
  import { _ } from 'svelte-i18n';

  const templates = [
    { icon: '🚀', name: 'Product Launch', type: 'checklist', desc: '30+ steps to launch your product' },
    { icon: '📧', name: 'Email Campaign', type: 'checklist', desc: 'From list to results' },
    { icon: '📊', name: 'Marketing Plan', type: 'document', desc: 'Quarterly strategy template' },
    { icon: '🔍', name: 'SEO Audit', type: 'checklist', desc: 'Technical & content SEO' },
    { icon: '📱', name: 'Social Media Launch', type: 'checklist', desc: 'Platform setup & strategy' },
    { icon: '📈', name: 'Performance Report', type: 'document', desc: 'Monthly metrics template' },
    { icon: '🎯', name: 'Campaign Prep', type: 'checklist', desc: 'Pre-launch campaign checklist' },
    { icon: '🔍', name: 'Competitive Analysis', type: 'document', desc: 'Market & competitor research' },
  ];
</script>

<div class="p-6">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">{$_('nav.templates')}</h1>
    <p class="text-gray-500 mt-1 text-sm">Ready-to-use marketing templates powered by AI</p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {#each templates as t}
      <div class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-primary-200 transition-all cursor-pointer group">
        <div class="text-3xl mb-3">{t.icon}</div>
        <h3 class="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">{t.name}</h3>
        <p class="text-xs text-gray-500 mt-1 mb-3">{t.desc}</p>
        <span class="text-xs px-2 py-1 rounded {t.type === 'checklist' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}">
          {t.type}
        </span>
      </div>
    {/each}
  </div>
</div>
