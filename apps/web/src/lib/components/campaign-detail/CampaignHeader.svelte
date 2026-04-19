<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { createEventDispatcher } from 'svelte';

  export let campaign: any;

  const dispatch = createEventDispatcher<{ edit: any; delete: string }>();

  const statusBadge: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    SCHEDULED: 'bg-yellow-100 text-yellow-700',
    ACTIVE: 'bg-green-100 text-green-700',
    PAUSED: 'bg-orange-100 text-orange-700',
    COMPLETED: 'bg-blue-100 text-blue-700',
  };

  const typeBadge: Record<string, string> = {
    EMAIL: 'bg-indigo-100 text-indigo-700',
    SOCIAL: 'bg-green-100 text-green-700',
    BLOG: 'bg-purple-100 text-purple-700',
    MULTI_CHANNEL: 'bg-orange-100 text-orange-700',
  };

  const statusLabel: Record<string, string> = {
    DRAFT: 'campaigns.draft',
    SCHEDULED: 'campaigns.scheduled',
    ACTIVE: 'campaigns.active',
    PAUSED: 'campaigns.paused',
    COMPLETED: 'campaigns.completed',
  };

  const typeLabel: Record<string, string> = {
    EMAIL: 'campaigns.email',
    SOCIAL: 'campaigns.social',
    BLOG: 'campaigns.blog',
    MULTI_CHANNEL: 'campaigns.multiChannel',
  };

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
  }

  $: hasMeta = campaign?.budget != null || (campaign?.goals && campaign.goals.trim() !== '');
</script>

<div class="bg-white rounded-xl border border-gray-200 p-5">
  <div class="flex flex-col sm:flex-row items-start justify-between gap-3">
    <div class="flex-1 min-w-0">
      <div class="flex flex-wrap items-center gap-1.5 mb-2">
        <span class="text-xs px-2 py-0.5 rounded font-medium {typeBadge[campaign.type] || 'bg-gray-100 text-gray-600'}">
          {$_(typeLabel[campaign.type] || 'campaigns.email')}
        </span>
        <span class="text-xs px-2 py-0.5 rounded {statusBadge[campaign.status] || 'bg-gray-100 text-gray-600'}">
          {$_(statusLabel[campaign.status] || 'campaigns.draft')}
        </span>
      </div>
      <h1 class="text-xl font-semibold text-gray-900 truncate">{campaign.name}</h1>
      {#if hasMeta}
        <div class="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
          {#if campaign.budget != null}
            <span class="inline-flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              {formatCurrency(campaign.budget)}
            </span>
          {/if}
          {#if campaign.goals}
            <span class="truncate">{campaign.goals}</span>
          {/if}
        </div>
      {/if}
    </div>
    <div class="flex items-center gap-2 flex-shrink-0">
      <button
        on:click={() => dispatch('edit', campaign)}
        class="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
      >
        {$_('common.edit')}
      </button>
      <button
        on:click={() => dispatch('delete', campaign.id)}
        class="text-xs px-2 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer"
        title={$_('campaigns.deleteCampaign')}
        aria-label={$_('campaigns.deleteCampaign')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
      </button>
    </div>
  </div>
</div>
