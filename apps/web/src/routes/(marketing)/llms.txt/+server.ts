import { text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ARTICLES, articlesFor, LANGS } from '$lib/marketing/content';
import { COPY } from '$lib/marketing/copy';
import { canonical, landingPath, blogIndexPath, articlePath, COMPANY } from '$lib/marketing/links';

export const prerender = true;

export const GET: RequestHandler = () => {
  const lines = [
    '# Marketing AI Assistant',
    '',
    `> ${COPY.en.meta.description}`,
    '',
    `Built and operated by ${COMPANY.name} (${COMPANY.url}).`,
    '',
    '## Landing pages',
    ...LANGS.map((lang) => `- [${lang.toUpperCase()}](${canonical(landingPath(lang))}): ${COPY[lang].meta.title}`),
    '',
    '## Blog',
    ...LANGS.flatMap((lang) => [
      `- [${lang.toUpperCase()} index](${canonical(blogIndexPath(lang))})`,
      ...articlesFor(ARTICLES, lang).map(
        (article) => `  - [${article.title}](${canonical(articlePath(lang, article.slug))}): ${article.description}`,
      ),
    ]),
    '',
  ];
  return text(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
