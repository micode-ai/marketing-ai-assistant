import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { Project } from '@marketing-ai/shared-types';

export const projectsStore = writable<Project[]>([]);
export const currentProjectStore = writable<Project | null>(null);

const storedOrgId = browser ? localStorage.getItem('organizationId') : null;
export const organizationIdStore = writable<string | null>(storedOrgId);

if (browser) {
  organizationIdStore.subscribe((id) => {
    if (id) localStorage.setItem('organizationId', id);
    else localStorage.removeItem('organizationId');
  });
}
