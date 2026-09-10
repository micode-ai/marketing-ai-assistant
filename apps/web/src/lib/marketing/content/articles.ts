import { marked } from 'marked';
import { parseFrontmatter, type FaqEntry } from './frontmatter';

export const LANGS = ['en', 'pl', 'ru'] as const;
export type Lang = (typeof LANGS)[number];

export interface Article {
  slug: string;
  lang: Lang;
  pair: string;
  title: string;
  description: string;
  date: string;
  updated: string;
  tags: string[];
  faq: FaqEntry[];
  html: string;
  readingMinutes: number;
}

const MAX_DESCRIPTION = 155;
const WORDS_PER_MINUTE = 200;

/**
 * Turns raw markdown files (path -> contents) into the validated article set.
 * Every rule below throws, so a malformed article fails the build rather than
 * shipping a page with a missing title or a one-way hreflang link.
 */
export function buildArticles(files: Record<string, string>): Article[] {
  const articles = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, raw]) => toArticle(path, raw));

  assertUniqueSlugs(articles);
  assertOnePairPerLanguage(articles);

  return articles.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export function articlesFor(articles: Article[], lang: Lang): Article[] {
  return articles.filter((article) => article.lang === lang);
}

export function articleBy(articles: Article[], lang: Lang, slug: string): Article | undefined {
  return articles.find((article) => article.lang === lang && article.slug === slug);
}

export function pairSlugs(articles: Article[], pair: string): Partial<Record<Lang, string>> {
  const result: Partial<Record<Lang, string>> = {};
  for (const article of articles) {
    if (article.pair === pair) result[article.lang] = article.slug;
  }
  return result;
}

function toArticle(path: string, raw: string): Article {
  const { meta, body } = parseFrontmatter(raw);
  const text = (key: string): string => {
    const value = meta[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${path}: frontmatter key "${key}" is missing or empty`);
    }
    return value;
  };

  const lang = text('lang');
  if (!(LANGS as readonly string[]).includes(lang)) {
    throw new Error(`${path}: unknown language "${lang}" — expected one of ${LANGS.join(', ')}`);
  }

  const description = text('description');
  if (description.length > MAX_DESCRIPTION) {
    throw new Error(`${path}: description is ${description.length} characters, the limit is ${MAX_DESCRIPTION}`);
  }

  const date = isoDate(path, 'date', text('date'));
  const updated = isoDate(path, 'updated', typeof meta.updated === 'string' ? meta.updated : date);
  if (updated < date) throw new Error(`${path}: updated (${updated}) is earlier than date (${date})`);

  const words = body.split(/\s+/).filter(Boolean).length;

  return {
    slug: text('slug'),
    lang: lang as Lang,
    pair: text('pair'),
    title: text('title'),
    description,
    date,
    updated,
    tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
    faq: Array.isArray(meta.faq) ? (meta.faq as FaqEntry[]) : [],
    html: marked.parse(body, { async: false }) as string,
    readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
  };
}

function isoDate(path: string, key: string, value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${path}: ${key} "${value}" is not an ISO date (YYYY-MM-DD)`);
  }
  return value;
}

function assertUniqueSlugs(articles: Article[]): void {
  const seen = new Set<string>();
  for (const article of articles) {
    const key = `${article.lang}/${article.slug}`;
    if (seen.has(key)) throw new Error(`duplicate slug "${article.slug}" in language "${article.lang}"`);
    seen.add(key);
  }
}

function assertOnePairPerLanguage(articles: Article[]): void {
  const seen = new Set<string>();
  for (const article of articles) {
    const key = `${article.pair}/${article.lang}`;
    if (seen.has(key)) {
      throw new Error(`pair "${article.pair}" has more than one "${article.lang}" article`);
    }
    seen.add(key);
  }
}
