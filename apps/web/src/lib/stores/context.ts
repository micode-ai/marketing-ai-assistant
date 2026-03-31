import { derived } from 'svelte/store';
import { currentProjectStore, organizationIdStore } from './projects';

export const contextStore = derived(
  [currentProjectStore, organizationIdStore],
  ([$project, $orgId]) => ({
    type: $project ? 'project' as const : 'organization' as const,
    projectId: $project?.id || null,
    organizationId: $orgId
  })
);
