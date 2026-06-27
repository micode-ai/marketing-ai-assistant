#!/usr/bin/env node
// Iris redesign — pass 3: finish the leftover `indigo-*` accent.
// Pass 1/2 left dual light/dark indigo patterns whose base is already a token
// (e.g. `text-brand dark:text-indigo-400`) plus variant-prefixed forms the
// earlier boundary regex skipped (`file:bg-indigo-50`, `hover:border-indigo-300`).
//
//   1. strip redundant `dark:…indigo…` overrides (token base already handles dark)
//   2. map every remaining `(prefix:)(bg|text|border|ring)-indigo-NNN` to brand,
//      shade-aware for bg (50/100 -> subtle tint, else solid brand)
//   3. catch variant-prefixed decorative `bg-{color}-50/100` the earlier pass left
//
// Run: node apps/web/scripts/iris-indigo-cleanup.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [join(root, 'src', 'routes', '(app)'), join(root, 'src', 'lib')];
const PALETTE = 'blue|sky|cyan|teal|green|emerald|lime|yellow|amber|orange|red|rose|pink|fuchsia|purple|violet|slate';

// strip whole ` dark:<anything>indigo<shade>` tokens (incl. file:/hover:/focus: nested).
// Char class must allow `-` and `/` so it crosses `bg-indigo` / `file:bg-indigo`.
const stripDarkIndigo = /\s+dark:[\w:/-]*indigo-\d+(?:\/\d+)?/g;

// Svelte `class:name` directives can't carry a `/opacity` class — skip them.
const isClassDirective = (pre) => (pre || '').split(':').includes('class');

// generic indigo -> brand (any variant prefix, drop opacity). `\d+` is greedy so
// `indigo-500` is captured whole (no -50-inside-500 false match).
function mapIndigo(s) {
  return s.replace(/((?:[a-z-]+:)*)(bg|text|border|ring)-indigo-(\d+)(?:\/\d+)?/g, (_m, pre, kind, shade) => {
    if (isClassDirective(pre)) return _m;
    pre = pre || '';
    if (kind === 'text') return pre + 'text-brand';
    if (kind === 'ring') return pre + 'ring-ring';
    if (kind === 'border') return pre + 'border-brand/40';
    // bg: light shades -> subtle tint, solid otherwise
    return pre + (Number(shade) <= 100 ? 'bg-brand-subtle/12' : 'bg-brand');
  });
}

// variant-prefixed decorative light chips the earlier pass skipped (e.g. file:bg-blue-50).
// `(?!\d)` guards against matching `-50` inside `-500`.
const prefixedChip = new RegExp(`((?:[a-z-]+:)+)(bg|border)-(${PALETTE})-(50|100|200)(?!\\d)(?:\\/\\d+)?`, 'g');
function mapPrefixedChip(s) {
  return s.replace(prefixedChip, (_m, pre, kind, color, shade) => {
    if (isClassDirective(pre)) return _m;
    if (kind === 'border') return `${pre}border-${color}-500/30`;
    return `${pre}bg-${color}-500/${shade === '50' ? '12' : '20'}`;
  });
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : name.endsWith('.svelte') && out.push(p);
  }
  return out;
}

let files = 0;
for (const base of targets) {
  for (const file of walk(base)) {
    const src = readFileSync(file, 'utf8');
    let out = src.replace(stripDarkIndigo, '');
    out = mapIndigo(out);
    out = mapPrefixedChip(out);
    if (out !== src) {
      writeFileSync(file, out, 'utf8');
      files++;
      console.log(`  ${file.replace(root, 'apps/web')}`);
    }
  }
}
console.log(`\nDone: ${files} files.`);
