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
        <p class="text-sm text-gray-500 mt-1">
          {subscription.status === 'trialing' ? '🎁 ' + $_('billing.trialing') : '✅ ' + $_('billing.active')} ·
          {$_('billing.renews')} {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
        </p>
      </div>
      {#if subscription.plan !== 'FREE'}
        <button on:click={openPortal} class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
          {$_('billing.manage')}
        </button>
      {/if}
    </div>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    {#each plans as plan}
      <div class="bg-white rounded-xl border-2 {plan.border} p-6 relative {plan.badgeKey ? 'ring-2 ring-primary-400 ring-offset-2' : ''}">
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
          <button on:click={() => checkout(plan.id)} class="w-full py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition">
            {$_('billing.upgradeTo', { values: { plan: $_(plan.nameKey) } })}
          </button>
        {:else}
          <div class="w-full py-2 text-center text-sm text-gray-400">{$_('billing.freeForever')}</div>
        {/if}
      </div>
    {/each}
  </div>
</div>
