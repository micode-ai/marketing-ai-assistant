import type { PageLoad } from './$types';
import { CONTENT_REVIEWED } from '$lib/marketing/links';

// Feeds the footer's visible "last updated" line (see (marketing)/+layout.svelte) and
// keeps it in sync with this page's sitemap `lastmod`, which uses the same constant.
export const load: PageLoad = () => ({ lastUpdated: CONTENT_REVIEWED });
