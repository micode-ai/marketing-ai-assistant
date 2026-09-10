import { text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ARTICLES } from '$lib/marketing/content';
import { sitemapEntries, renderSitemap } from '$lib/marketing/seo/sitemap';

export const prerender = true;

export const GET: RequestHandler = () => {
  const today = new Date().toISOString().slice(0, 10);
  return text(renderSitemap(sitemapEntries(ARTICLES, today)), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
