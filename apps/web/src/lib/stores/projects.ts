import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { Project } from '@marketing-ai/shared-types';

export const projectsStore = writable<Project[]>([]);
export const projectsLoaded = writable(false);

// currentProjectStore: full Project object, restored in +layout.svelte
export const currentProjectStore = writable<Project | null>(null);

// Exported so +layout.svelte can attempt restoration before projectsStore loads
export const _storedProjectId: string | null = browser ? localStorage.getItem('currentProjectId') : null;

// Persist currentProjectStore to localStorage
if (browser) {
  currentProjectStore.subscribe((project) => {
    if (project) localStorage.setItem('currentProjectId', project.id);
    else localStorage.removeItem('currentProjectId');
  });
}

// Flag to prevent project pages from re-setting currentProjectStore during org navigation
export const navigatingToOrg = writable(false);

const storedOrgId = browser ? localStorage.getItem('organizationId') : null;
export const organizationIdStore = writable<string | null>(storedOrgId);

if (browser) {
  organizationIdStore.subscribe((id) => {
    if (id) localStorage.setItem('organizationId', id);
    else localStorage.removeItem('organizationId');
  });
}
