#!/usr/bin/env node
// Iris redesign — pass 4: the neutral tail pass 1 missed (variant-prefixed forms
// like `hover:text-gray-700`, `bg-gray-200` skeletons/tracks, `prose-*:text-gray-*`,
// `placeholder-gray-400`, `disabled:bg-gray-50`).
//
// Deliberately LEFT ALONE: `text-white` (on colored bg), `bg-gray-{600,700,800,900}`
// (intentional dark elements: tooltips, dark badges, overlays), and Svelte
// `class:` directives.
//
// Run: node apps/web/scripts/iris-neutral-tail.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [join(root, 'src', 'routes', '(app)'), join(root, 'src', 'lib')];

const isClassDirective = (pre) => (pre || '').split(':').includes('class');

// Generic: matches an optional variant-prefix chain + a neutral utility.
// Shade-aware mapping per utility kind; returns null to skip (leave untouched).
function tokenFor(kind, shade) {
  const n = Number(shade);
  switch (kind) {
    case 'bg':
      if (n <= 200) return 'bg-surface-2';
      if (n === 300) return 'bg-border-strong';
      if (n <= 500) return 'bg-ink-subtle';
      return null; // 600-900: intentional dark element — leave
    case 'text':
      if (n <= 400) return 'text-ink-subtle';
      if (n <= 600) return 'text-ink-muted';
      return 'text-ink'; // 700-900
    case 'border': return 'border-border';
    case 'divide': return 'divide-border';
    case 'ring': return 'ring-border';
    case 'placeholder': return 'placeholder-ink-subtle';
    default: return null;
  }
}

const re = /((?:[a-z-]+:)*)(bg|text|border|divide|ring|placeholder)-gray-(\d+)(?:\/\d+)?/g;

function migrate(src) {
  let count = 0;
  const out = src.replace(re, (m, pre, kind, shade) => {
    if (isClassDirective(pre)) return m;
    const tok = tokenFor(kind, shade);
    if (!tok) return m;
    count++;
    return (pre || '') + tok;
  });
  return { out, count };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : name.endsWith('.svelte') && out.push(p);
  }
  return out;
}

let files = 0, total = 0;
for (const base of targets) {
  for (const file of walk(base)) {
    const src = readFileSync(file, 'utf8');
    const { out, count } = migrate(src);
    if (out !== src) {
      writeFileSync(file, out, 'utf8');
      files++; total += count;
      console.log(`${count.toString().padStart(4)}  ${file.replace(root, 'apps/web')}`);
    }
  }
}
console.log(`\nDone: ${total} replacements across ${files} files.`);
