<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { createEventDispatcher } from 'svelte';

  // Declared inline: Svelte does not allow an exported interface in an instance
  // script, and no consumer needs to import the type.
  type AccountOption = { id: string; accountName: string; accountId: string };

  export let accounts: AccountOption[] = [];
  export let selectedId: string | null = null;

  const dispatch = createEventDispatcher<{ change: string }>();

  // With one account there is nothing to switch, and a select with a single
  // option only adds noise. It appears exactly when it means something.
  $: visible = accounts.length > 1;

  function onChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value && value !== selectedId) dispatch('change', value);
  }
</script>

{#if visible}
  <div class="flex items-center gap-2">
    <label class="text-xs text-ink-subtle" for="account-switcher">
      {$_('analytics.accountSwitcher.label')}
    </label>
    <select
      id="account-switcher"
      class="input py-1 text-sm"
      value={selectedId ?? accounts[0]?.id}
      on:change={onChange}
    >
      {#each accounts as account (account.id)}
        <option value={account.id}>{account.accountName}</option>
      {/each}
    </select>
  </div>
{/if}
