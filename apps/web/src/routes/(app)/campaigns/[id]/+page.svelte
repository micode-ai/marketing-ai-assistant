<script lang="ts">
  import { page } from '$app/stores';
  import CampaignDetail from '$lib/components/campaign-detail/CampaignDetail.svelte';

  $: campaignId = $page.params['id'] ?? '';
</script>

<CampaignDetail {campaignId} backHref="/campaigns" />
