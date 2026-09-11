import type { ParamMatcher } from '@sveltejs/kit';

/** Landing prefixes only — English lives at the root, so it is not matched here. */
export const match: ParamMatcher = (param) => param === 'pl' || param === 'ru';
