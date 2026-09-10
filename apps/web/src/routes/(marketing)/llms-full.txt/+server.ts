import { text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ARTICLES, articlesFor, LANGS, RAW_BODIES, type Lang } from '$lib/marketing/content';
import { COPY } from '$lib/marketing/copy';
import { articlePath, canonical } from '$lib/marketing/links';

export const prerender = true;

export const GET: RequestHandler = () => {
  const sections = LANGS.map((lang) => renderLanguage(lang));
  return text(sections.join('\n\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};

/**
 * The whole corpus as markdown for one language: landing copy first (h1, sub, every
 * feature, every step, every FAQ pair), then an `## Articles` section holding every
 * article as `### <title>` with its canonical URL on the following line, then its
 * original markdown body (from RAW_BODIES, not the stripped HTML on Article.html).
 *
 * The landing sections and each article title are both one level below the language's
 * top-level `#`, so they'd be indistinguishable at `##` — an article's own `##`
 * subheadings would read as siblings of "Articles" rather than as belonging to it. Titling
 * articles `###` under one `## Articles` heading keeps the hierarchy unambiguous, and the
 * URL line lets a model quoting the body cite its source.
 */
function renderLanguage(lang: Lang): string {
  const copy = COPY[lang];
  const articles = articlesFor(ARTICLES, lang);
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
    ...(articles.length > 0
      ? [
          '## Articles',
          '',
          ...articles.flatMap((article) => [
            `### ${article.title}`,
            canonical(articlePath(lang, article.slug)),
            '',
            RAW_BODIES[`${lang}/${article.slug}`] ?? '',
            '',
          ]),
        ]
      : []),
  ];
  return lines.join('\n').trim();
}
