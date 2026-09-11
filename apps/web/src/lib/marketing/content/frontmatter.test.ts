import { describe, it, expect } from 'vitest';
import { parseFrontmatter, type FaqEntry } from './frontmatter';

const DOC = `---
slug: ai-content-calendar
lang: en
title: "How to build an AI content calendar"
description: A short summary
date: 2026-09-10
tags: [content, planning]
faq:
  - q: What is an AI content calendar?
    a: A schedule of posts planned with an AI assistant.
  - q: Does it replace a strategy?
    a: No.
---

First paragraph.

## A heading
`;

describe('parseFrontmatter', () => {
  it('reads scalar keys and strips surrounding quotes', () => {
    const { meta } = parseFrontmatter(DOC);
    expect(meta.slug).toBe('ai-content-calendar');
    expect(meta.title).toBe('How to build an AI content calendar');
    expect(meta.date).toBe('2026-09-10');
  });

  it('reads inline arrays', () => {
    expect(parseFrontmatter(DOC).meta.tags).toEqual(['content', 'planning']);
  });

  it('reads the faq list of question/answer pairs', () => {
    const faq = parseFrontmatter(DOC).meta.faq as FaqEntry[];
    expect(faq).toHaveLength(2);
    expect(faq[0]).toEqual({
      q: 'What is an AI content calendar?',
      a: 'A schedule of posts planned with an AI assistant.',
    });
    expect(faq[1].a).toBe('No.');
  });

  it('returns the body without the frontmatter block', () => {
    const { body } = parseFrontmatter(DOC);
    expect(body.startsWith('First paragraph.')).toBe(true);
    expect(body).not.toContain('slug:');
  });

  it('treats a document without frontmatter as pure body', () => {
    expect(parseFrontmatter('# Just markdown')).toEqual({ meta: {}, body: '# Just markdown' });
  });

  it('only strips quotes when the same quote character opens and closes the value', () => {
    const doc = `---
title: Marketers'
subtitle: "Quoted"
---

Body.
`;
    const { meta } = parseFrontmatter(doc);
    expect(meta.title).toBe("Marketers'");
    expect(meta.subtitle).toBe('Quoted');
  });
});
