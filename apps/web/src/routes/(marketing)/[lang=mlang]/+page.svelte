<script lang="ts">
  import Landing from '$lib/marketing/Landing.svelte';
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<Landing lang={data.lang} />
