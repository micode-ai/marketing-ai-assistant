import { SetMetadata } from '@nestjs/common';

/**
 * Kinds of record a route parameter can name. Each one is resolved to its owning
 * organization or project by TenantScopeGuard (see RESOLVERS there).
 */
export type TenantResourceKind =
  | 'organization'
  | 'project'
  | 'webhook'
  | 'emailAccount'
  | 'emailList'
  | 'emailSubscriber'
  | 'emailCampaign'
  | 'emailSequence'
  | 'campaign'
  | 'content'
  | 'checklist'
  | 'checklistItem'
  | 'chatSession'
  | 'chatMessage'
  | 'abTest'
  | 'abTestVariant'
  | 'document'
  | 'documentType'
  | 'financeCategory'
  | 'financeRecord';

export const TENANT_RESOURCE_KEY = 'tenantResource';
export const SKIP_TENANT_SCOPE_KEY = 'skipTenantScope';

/**
 * Maps request fields to the record kind they identify, e.g.
 * `@TenantResource({ id: 'webhook' })` (route param) or
 * `@TenantResource({ 'body.listId': 'emailList' })` (body field; a string or an array of ids).
 * Put it on the controller, and on a handler to override the controller's map for
 * that route — a handler map REPLACES the class map, so repeat the param entries.
 * A field not present on a request is ignored.
 */
export const TenantResource = (map: Record<string, TenantResourceKind>) => SetMetadata(TENANT_RESOURCE_KEY, map);

/** Opts a route out of TenantScopeGuard. Only for routes whose service enforces access itself. */
export const SkipTenantScope = () => SetMetadata(SKIP_TENANT_SCOPE_KEY, true);
