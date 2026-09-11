// Overrides the app-wide client-only rendering: these pages are emitted as plain
// HTML at build time, with no JS bundle, so crawlers and AI readers see real text.
export const ssr = true;
export const prerender = true;
export const csr = false;
export const trailingSlash = 'always';
