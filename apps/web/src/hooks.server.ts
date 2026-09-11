import type { Handle } from '@sveltejs/kit';
import { langFromPath } from '$lib/marketing/lang-from-path';

export const handle: Handle = async ({ event, resolve }) => {
  const accessToken = event.cookies.get('accessToken');

  if (accessToken) {
    try {
      const apiUrl = process.env['API_URL'] || 'http://localhost:3005/api';
      const response = await fetch(`${apiUrl}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        event.locals.user = await response.json();
      } else {
        event.locals.user = null;
      }
    } catch {
      event.locals.user = null;
    }
  } else {
    event.locals.user = null;
  }

  // %lang% is a placeholder in app.html; SvelteKit only substitutes %sveltekit.*%,
  // so the page language is filled in here. This also runs during prerendering.
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%lang%', langFromPath(event.url.pathname)),
  });
};
