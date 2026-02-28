<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore } from '$lib/stores/projects';

  let subscription: any = null;
  let loading = true;

  onMount(async () => {
    if ($organizationIdStore) {
      try {
        subscription = await api.get('/billing/subscription', { organizationId: $organizationIdStore });
      } catch (e) { console.error(e); }
    }
    loading = false;
  });

  async function openPortal() {
    try {
      const res = await api.post<{ url: string }>('/billing/portal', {
        organizationId: $organizationIdStore,
        returnUrl: window.location.href,
      });
      window.location.href = res.url;
    } catch(e: any) { alert(e.message); }
  }

  async function checkout(plan: string) {
    try {
      const res = await api.post<{ url: string }>('/billing/checkout', {
        organizationId: $organizationIdStore,
        plan,
        successUrl: window.location.origin + '/settings/billing?success=true',
        cancelUrl: window.location.href,
      });
      window.location.href = res.url;
    } catch(e: any) { alert(e.message); }
  }

  $: plans = [
    {
      id: 'FREE', nameKey: 'billing.freePlan', price: '$0', badgeKey: null,
      border: 'border-gray-200',
      featuresKey: 'billing.planFeatures.free',
    },
    {
      id: 'PRO', nameKey: 'billing.proPlan', price: '$29', badgeKey: 'billing.mostPopular',
      border: 'border-primary-400',
      featuresKey: 'billing.planFeatures.pro',
    },
    {
      id: 'ENTERPRISE', nameKey: 'billing.enterprisePlan', price: '$99', badgeKey: null,
      border: 'border-gray-200',
      featuresKey: 'billing.planFeatures.enterprise',
    },
  ];
</script>

<div class="p-6 max-w-5xl mx-auto">
  <h1 class="text-2xl font-bold text-gray-900 mb-1">{$_('billing.title')}</h1>
  <p class="text-gray-500 text-sm mb-8">{$_('billing.manageDesc')}</p>

  {#if !loading && subscription}
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-8 flex items-center justify-between">
      <div>
        <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">{$_('billing.currentPlan')}</p>
        <p class="text-2xl font-bold text-gray-900 mt-1">{subscription.plan}</p>
        <p class="text-sm text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
          {#if subscription.status === 'trialing'}
            <span class="inline-flex items-center gap-1 text-amber-600">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
              {$_('billing.trialing')}
            </span>
          {:else}
            <span class="inline-flex items-center gap-1 text-green-600">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              {$_('billing.active')}
            </span>
          {/if}
          <span class="text-gray-300">·</span>
          <span>{$_('billing.renews')} {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>
        </p>
      </div>
      {#if subscription.plan !== 'FREE'}
        <button on:click={openPortal} class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors duration-150 cursor-pointer">
          {$_('billing.manage')}
        </button>
      {/if}
    </div>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    {#each plans as plan}
      <div class="bg-white rounded-xl border-2 {plan.border} p-6 relative hover:shadow-lg transition-shadow duration-200 {plan.badgeKey ? 'ring-2 ring-primary-400 ring-offset-2' : ''}">
        {#if plan.badgeKey}
          <div class="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-xs font-bold px-3 py-1 rounded-full">{$_(plan.badgeKey)}</div>
        {/if}
        <h3 class="text-xl font-bold text-gray-900">{$_(plan.nameKey)}</h3>
        <div class="my-3">
          <span class="text-3xl font-bold text-gray-900">{plan.price}</span>
          <span class="text-gray-400 text-sm">{$_('billing.monthly')}</span>
        </div>
        <ul class="space-y-2 mb-6">
          {#each ($_( plan.featuresKey) as string[]) as f}
            <li class="flex items-center gap-2 text-sm text-gray-600">
              <svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
              {f}
            </li>
          {/each}
        </ul>
        {#if !loading && subscription?.plan === plan.id}
          <div class="w-full py-2 text-center text-sm text-gray-400 border border-gray-200 rounded-lg">{$_('billing.currentPlanBtn')}</div>
        {:else if plan.id !== 'FREE'}
          <button on:click={() => checkout(plan.id)} class="w-full py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors duration-150 cursor-pointer">
            {$_('billing.upgradeTo', { values: { plan: $_(plan.nameKey) } })}
          </button>
        {:else}
          <div class="w-full py-2 text-center text-sm text-gray-400">{$_('billing.freeForever')}</div>
        {/if}
      </div>
    {/each}
  </div>
</div>
