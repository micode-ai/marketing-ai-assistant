#!/usr/bin/env node
// Iris redesign — pass 2: make decorative/semantic colors dark-safe and map the
// leftover `indigo-*` accent (the app's old "selected" colour, skipped by pass 1)
// to brand tokens.
//
// Why: opaque light chips like `bg-blue-50` render as bright blocks on the dark
// (default) canvas. Converting them to a translucent 500-shade tint reads
// correctly on BOTH themes while preserving hue variety. Text colours are left
// alone (they stay readable on the faint tint in both themes).
//
// Run: node apps/web/scripts/iris-colors-codemod.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [join(root, 'src', 'routes', '(app)'), join(root, 'src', 'lib')];

// Decorative + semantic palette (NOT indigo — that maps to brand below).
const PALETTE = ['blue', 'sky', 'cyan', 'teal', 'green', 'emerald', 'lime', 'yellow', 'amber', 'orange', 'red', 'rose', 'pink', 'fuchsia', 'purple', 'violet', 'slate'];

// [fromToken, toString, keepOpacity]
const MAP = [];

// indigo -> brand tokens (longest / prefixed first)
MAP.push(
  ['hover:bg-indigo-100', 'hover:bg-brand-subtle/15', false],
  ['hover:bg-indigo-50', 'hover:bg-brand-subtle/10', false],
  ['hover:bg-indigo-700', 'hover:brightness-110', false],
  ['hover:text-indigo-700', 'hover:text-brand', false],
  ['hover:text-indigo-600', 'hover:text-brand', false],
  ['focus:ring-indigo-500', 'focus:ring-ring', false],
  ['focus:border-indigo-500', 'focus:border-brand', false],
  ['bg-indigo-600', 'bg-brand', false],
  ['bg-indigo-100', 'bg-brand-subtle/15', false],
  ['bg-indigo-50', 'bg-brand-subtle/10', false],
  ['text-indigo-700', 'text-brand', false],
  ['text-indigo-600', 'text-brand', false],
  ['text-indigo-500', 'text-brand', false],
  ['text-indigo-400', 'text-brand', false],
  ['border-indigo-500', 'border-brand', false],
  ['border-indigo-200', 'border-brand/40', false],
  ['ring-indigo-500', 'ring-ring', false],
);

// decorative palette: opaque light tints -> translucent 500-shade (dark-safe)
for (const c of PALETTE) {
  MAP.push(
    [`hover:bg-${c}-100`, `hover:bg-${c}-500/20`, false],
    [`hover:bg-${c}-50`, `hover:bg-${c}-500/12`, false],
    [`bg-${c}-100`, `bg-${c}-500/20`, false],
    [`bg-${c}-50`, `bg-${c}-500/12`, false],
    [`border-${c}-200`, `border-${c}-500/30`, false],
    [`border-${c}-100`, `border-${c}-500/20`, false],
  );
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lead = '(?<![\\w:/\\[\\]._-])';
const rules = MAP.map(([from, to, keepOpacity]) => {
  // tokens with their own opacity target: swallow any source `/NN` so we don't
  // produce `bg-blue-500/12/50`.
  const tail = keepOpacity ? '(\\/\\d+)?(?![\\w\\[\\]._-])' : '(?:\\/\\d+)?(?![\\w\\[\\]._-])';
  return { re: new RegExp(lead + esc(from) + tail, 'g'), to: keepOpacity ? to + '$1' : to };
});

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : name.endsWith('.svelte') && out.push(p);
  }
  return out;
}

let totalFiles = 0, totalReplacements = 0;
for (const base of targets) {
  for (const file of walk(base)) {
    const src = readFileSync(file, 'utf8');
    let out = src, count = 0;
    for (const { re, to } of rules) {
      out = out.replace(re, (_full, opacity) => { count++; return to.replace('$1', opacity || ''); });
    }
    if (out !== src) {
      writeFileSync(file, out, 'utf8');
      totalFiles++; totalReplacements += count;
      console.log(`${count.toString().padStart(4)}  ${file.replace(root, 'apps/web')}`);
    }
  }
}
console.log(`\nDone: ${totalReplacements} replacements across ${totalFiles} files.`);
