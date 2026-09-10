import type { EntryGenerator, PageLoad } from './$types';
import type { Lang } from '$lib/marketing/content/articles';

export const entries: EntryGenerator = () => [{ lang: 'pl' }, { lang: 'ru' }];

export const load: PageLoad = ({ params }) => ({ lang: params.lang as Lang });
