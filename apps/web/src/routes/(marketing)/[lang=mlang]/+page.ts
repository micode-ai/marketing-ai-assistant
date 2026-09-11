import type { EntryGenerator, PageLoad } from './$types';
import type { Lang } from '$lib/marketing/content/articles';
import { CONTENT_REVIEWED } from '$lib/marketing/links';

export const entries: EntryGenerator = () => [{ lang: 'pl' }, { lang: 'ru' }];

// lastUpdated feeds the footer's visible "last updated" line (see
// (marketing)/+layout.svelte) and keeps it in sync with this page's sitemap `lastmod`.
export const load: PageLoad = ({ params }) => ({ lang: params.lang as Lang, lastUpdated: CONTENT_REVIEWED });
