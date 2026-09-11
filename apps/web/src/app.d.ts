import type { User } from '@marketing-ai/shared-types';
import type { Lang } from '$lib/marketing/content/articles';

declare global {
  namespace App {
    interface Locals {
      user: User | null;
    }
    interface PageData {
      user?: User | null;
      // Set by (marketing) page loads, read by (marketing)/+layout.svelte's footer and
      // language switcher — see the fixes for the marketing landing/blog language
      // switcher and visible "last updated" date.
      langHrefs?: Partial<Record<Lang, string>>;
      lastUpdated?: string;
    }
  }
}

export {};
