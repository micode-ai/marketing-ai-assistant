#!/usr/bin/env node
// Iris redesign codemod: migrate hardcoded neutral/`primary` Tailwind utilities
// to semantic Iris tokens across the logged-in app + shared components.
//
// Scope: apps/web/src/routes/(app) and apps/web/src/lib (*.svelte).
// Skipped: (auth) group, root +layout/+page, auth/callback (out of redesign scope).
//
// Safe by construction: each utility is matched as a whole class token with
// boundary guards, longest/prefixed-first, with optional `/<opacity>` preserved
// (except where the target already carries an opacity).
//
// Run: node apps/web/scripts/iris-codemod.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'); // apps/web
const targets = [join(root, 'src', 'routes', '(app)'), join(root, 'src', 'lib')];

// from → to. keepOpacity=false when the target already includes an opacity suffix.
const MAP = [
  // prefixed / longest first
  ['hover:bg-gray-50', 'hover:bg-surface-2'],
  ['hover:bg-gray-100', 'hover:bg-surface-2'],
  ['hover:bg-primary-700', 'hover:brightness-110'],
  ['bg-primary-600', 'bg-brand'],
  ['bg-primary-50', 'bg-brand-subtle/10', false],
  ['text-primary-600', 'text-brand'],
  ['text-primary-700', 'text-brand'],
  // backgrounds
  ['bg-gray-100', 'bg-surface-2'],
  ['bg-gray-50', 'bg-surface-2'],
  ['bg-white', 'bg-surface'],
  // text
  ['text-gray-900', 'text-ink'],
  ['text-gray-800', 'text-ink'],
  ['text-gray-700', 'text-ink'],
  ['text-gray-600', 'text-ink-muted'],
  ['text-gray-500', 'text-ink-muted'],
  ['text-gray-400', 'text-ink-subtle'],
  ['text-gray-300', 'text-ink-subtle'],
  // borders / dividers
  ['border-gray-200', 'border-border'],
  ['border-gray-100', 'border-border'],
  ['border-gray-300', 'border-border'],
  ['divide-gray-200', 'divide-border'],
  ['divide-gray-100', 'divide-border'],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// leading: not preceded by a class-token char; trailing handled with optional /opacity
const lead = '(?<![\\w:/\\[\\]._-])';
const rules = MAP.map(([from, to, keepOpacity = true]) => {
  const tail = keepOpacity
    ? '(\\/\\d+)?(?![\\w\\[\\]._-])'
    : '(?![\\w\\[\\]/._-])';
  return {
    re: new RegExp(lead + esc(from) + tail, 'g'),
    to: keepOpacity ? to + '$1' : to,
  };
});

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

// Tokens now drive light+dark, so `dark:` neutral overrides on tokenized base
// classes are redundant/conflicting. Strip them (keep `black` — used for modal
// overlays — and gradient from/to/via stops untouched).
const stripDark = /\s+dark:(?:hover:|focus:|group-hover:)?(?:bg|text|border|divide|ring|placeholder:text)-(?:gray|white|slate|zinc|neutral|stone)[-/0-9a-z]*/g;

let totalFiles = 0;
let totalReplacements = 0;
for (const base of targets) {
  for (const file of walk(base)) {
    const src = readFileSync(file, 'utf8');
    let out = src;
    let count = 0;
    for (const { re, to } of rules) {
      out = out.replace(re, (_full, opacity) => {
        count++;
        return to.replace('$1', opacity || '');
      });
    }
    out = out.replace(stripDark, () => { count++; return ''; });
    // primary-50 family (any variant prefix, any opacity) → theme-aware brand tint
    out = out.replace(/((?:[a-z-]+:)*)bg-primary-50(?:\/\d+)?(?![\w/])/g, (_m, pre) => {
      count++;
      return `${pre}bg-brand-subtle/10`;
    });
    if (out !== src) {
      writeFileSync(file, out, 'utf8');
      totalFiles++;
      totalReplacements += count;
      console.log(`${count.toString().padStart(4)}  ${file.replace(root, 'apps/web')}`);
    }
  }
}
console.log(`\nDone: ${totalReplacements} replacements across ${totalFiles} files.`);
