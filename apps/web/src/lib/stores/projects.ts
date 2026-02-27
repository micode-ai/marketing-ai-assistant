import { writable } from 'svelte/store';
import type { Project } from '@marketing-ai/shared-types';

export const projectsStore = writable<Project[]>([]);
export const currentProjectStore = writable<Project | null>(null);
export const organizationIdStore = writable<string | null>(null);
