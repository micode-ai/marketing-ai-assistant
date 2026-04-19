<script lang="ts">
  import { page } from '$app/stores';
  import CampaignDetail from '$lib/components/campaign-detail/CampaignDetail.svelte';

  $: projectId = $page.params['id'] ?? '';
  $: campaignId = $page.params['campaignId'] ?? '';
</script>

<CampaignDetail {campaignId} backHref={`/projects/${projectId}/campaigns`} />
