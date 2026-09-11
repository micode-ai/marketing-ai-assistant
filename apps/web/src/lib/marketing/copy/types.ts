import type { FaqEntry } from '../content/frontmatter';

export interface LandingCopy {
  meta: { title: string; description: string };
  nav: { blog: string; login: string; start: string; skipToContent: string };
  hero: { h1: string; sub: string; primaryCta: string; secondaryCta: string };
  features: { heading: string; lead: string; items: { title: string; body: string }[] };
  how: { heading: string; steps: { title: string; body: string }[] };
  faq: { heading: string; items: FaqEntry[] };
  products: {
    heading: string;
    lead: string;
    items: { key: 'ai-budget' | 'eksiegowy'; blurb: string }[];
    storeCta: string;
    visitCta: string;
  };
  footer: { about: string; legal: string; privacy: string; terms: string; blog: string; rights: string };
  blog: {
    indexTitle: string;
    indexDescription: string;
    empty: string;
    minutes: string;
    updatedOn: string;
    readMore: string;
    backToIndex: string;
    faqHeading: string;
    chooserTitle: string;
    chooserLead: string;
  };
}
