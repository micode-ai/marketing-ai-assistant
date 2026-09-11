import type { Article, Lang } from '../content/articles';
import type { FaqEntry } from '../content/frontmatter';
import { COMPANY, SITE, SOCIALS, canonical, articlePath } from '../links';

const ORG_ID = `${SITE}/#organization`;
const SITE_ID = `${SITE}/#website`;

export function organizationNode(): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: COMPANY.name,
    url: COMPANY.url,
    logo: `${SITE}/icon-512.png`,
  };
  // sameAs means "another identity page for this same entity". Sibling products are
  // not that, so they stay out of it and are linked from the page body instead.
  if (SOCIALS.length > 0) node.sameAs = SOCIALS.map((social) => social.url);
  return node;
}

export function websiteNode(lang: Lang, name: string): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: `${SITE}/`,
    name,
    inLanguage: lang,
    publisher: { '@id': ORG_ID },
  };
}

export function softwareApplicationNode(name: string, description: string, lang: Lang): Record<string, unknown> {
  return {
    '@type': 'SoftwareApplication',
    name,
    description,
    url: `${SITE}/`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: lang,
    publisher: { '@id': ORG_ID },
  };
}

export function faqNode(items: FaqEntry[]): Record<string, unknown> {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export function breadcrumbNode(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: canonical(item.path),
    })),
  };
}

export function articleNode(article: Article): Record<string, unknown> {
  const url = canonical(articlePath(article.lang, article.slug));
  return {
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: article.date,
    dateModified: article.updated,
    inLanguage: article.lang,
    mainEntityOfPage: url,
    url,
    image: `${SITE}/icon-512.png`,
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
  };
}

/** Serialises nodes into one @graph, escaped so it cannot break out of the script tag. */
export function jsonLdScript(nodes: Record<string, unknown>[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
}
