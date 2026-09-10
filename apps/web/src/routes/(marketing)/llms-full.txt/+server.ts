import { text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ARTICLES, articlesFor, LANGS, RAW_BODIES, type Lang } from '$lib/marketing/content';
import { COPY } from '$lib/marketing/copy';

export const prerender = true;

export const GET: RequestHandler = () => {
  const sections = LANGS.map((lang) => renderLanguage(lang));
  return text(sections.join('\n\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};

/**
 * The whole corpus as markdown for one language: landing copy first (h1, sub, every
 * feature, every step, every FAQ pair), then each article as `## <title>` followed by
 * its original markdown body (from RAW_BODIES, not the stripped HTML on Article.html).
 */
function renderLanguage(lang: Lang): string {
  const copy = COPY[lang];
  const lines = [
    `# ${copy.hero.h1}`,
    '',
    copy.hero.sub,
    '',
    `## ${copy.features.heading}`,
    '',
    copy.features.lead,
    '',
    ...copy.features.items.flatMap((item) => [`### ${item.title}`, '', item.body, '']),
    `## ${copy.how.heading}`,
    '',
    ...copy.how.steps.flatMap((step) => [`### ${step.title}`, '', step.body, '']),
    `## ${copy.faq.heading}`,
    '',
    ...copy.faq.items.flatMap((item) => [`### ${item.q}`, '', item.a, '']),
    ...articlesFor(ARTICLES, lang).flatMap((article) => [
      `## ${article.title}`,
      '',
      RAW_BODIES[`${lang}/${article.slug}`] ?? '',
      '',
    ]),
  ];
  return lines.join('\n').trim();
}
