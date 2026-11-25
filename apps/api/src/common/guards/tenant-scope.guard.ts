import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_TENANT_SCOPE_KEY, TENANT_RESOURCE_KEY, TenantResourceKind } from '../decorators/tenant-resource.decorator';

type Owner = { organizationId?: string | null; projectId?: string | null };
type Resolver = (prisma: PrismaService, id: string) => Promise<Owner | null>;

const sel = { organizationId: true, projectId: true } as const;

// Each kind resolves to the organization and/or project that owns the record.
// Child records (subscriber, item, message, variant) resolve through their parent.
const RESOLVERS: Record<TenantResourceKind, Resolver> = {
  organization: async (_p, id) => ({ organizationId: id }),
  project: (p, id) => p.project.findUnique({ where: { id }, select: { organizationId: true } }),
  webhook: (p, id) => p.webhook.findUnique({ where: { id }, select: { organizationId: true } }),
  emailAccount: (p, id) => p.emailAccount.findUnique({ where: { id }, select: { organizationId: true } }),
  emailList: (p, id) => p.emailList.findUnique({ where: { id }, select: sel }),
  emailSubscriber: async (p, id) =>
    (await p.emailSubscriber.findUnique({ where: { id }, select: { list: { select: sel } } }))?.list ?? null,
  emailCampaign: async (p, id) =>
    (await p.emailCampaign.findUnique({ where: { id }, select: { list: { select: sel } } }))?.list ?? null,
  emailSequence: (p, id) => p.emailSequence.findUnique({ where: { id }, select: sel }),
  campaign: (p, id) => p.campaign.findUnique({ where: { id }, select: sel }),
  content: (p, id) => p.content.findUnique({ where: { id }, select: sel }),
  checklist: (p, id) => p.checklist.findUnique({ where: { id }, select: sel }),
  checklistItem: async (p, id) =>
    (await p.checklistItem.findUnique({ where: { id }, select: { checklist: { select: sel } } }))?.checklist ?? null,
  chatSession: (p, id) => p.chatSession.findUnique({ where: { id }, select: { projectId: true } }),
  chatMessage: async (p, id) =>
    (await p.chatMessage.findUnique({ where: { id }, select: { session: { select: { projectId: true } } } }))?.session ?? null,
  abTest: (p, id) => p.aBTest.findUnique({ where: { id }, select: sel }),
  abTestVariant: async (p, id) =>
    (await p.aBTestVariant.findUnique({ where: { id }, select: { test: { select: sel } } }))?.test ?? null,
  document: (p, id) => p.document.findUnique({ where: { id }, select: sel }),
  documentType: (p, id) => p.documentTypeConfig.findUnique({ where: { id }, select: { organizationId: true } }),
  financeCategory: (p, id) => p.financeCategory.findUnique({ where: { id }, select: sel }),
  financeRecord: (p, id) => p.financeRecord.findUnique({ where: { id }, select: sel }),
};

/**
 * Global tenant isolation (registered after JwtAuthGuard).
 *
 * 1. Any `organizationId` or `projectId` in the route params, query string or top-level
 *    body must belong to an organization the caller has JOINED.
 * 2. Any route parameter mapped by @TenantResource is looked up, and the record's owning
 *    organization/project must pass the same check.
 *
 * Before this guard most controllers trusted those ids as given, so any signed-in user
 * could read and change other organizations' data (incident 2026-11-24).
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_SCOPE_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const joinedOrgs = new Set<string>(
      (user.memberships ?? []).filter((m: any) => m.joinedAt != null).map((m: any) => m.organizationId),
    );

    const orgIds = new Set<string>();
    const projectIds = new Set<string>();
    for (const src of [req.params, req.query, req.body]) {
      if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
      collect(src.organizationId, orgIds);
      collect(src.projectId, projectIds);
    }

    const resourceMap = this.reflector.getAllAndOverride<Record<string, TenantResourceKind>>(TENANT_RESOURCE_KEY, targets);
    if (resourceMap) {
      for (const [key, kind] of Object.entries(resourceMap)) {
        // 'id' → route param; 'body.listId' / 'query.listId' → that field (a string or an array of ids).
        const [where, field] = key.includes('.') ? key.split('.', 2) : ['params', key];
        const source = where === 'body' ? req.body : where === 'query' ? req.query : req.params;
        const raw = source && typeof source === 'object' ? source[field] : undefined;
        const ids = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : [];
        for (const id of ids) {
          if (!id) continue;
          const owner = await RESOLVERS[kind](this.prisma, id);
          if (!owner || (!owner.organizationId && !owner.projectId)) throw new NotFoundException('Not found');
          collect(owner.organizationId, orgIds);
          collect(owner.projectId, projectIds);
        }
      }
    }

    if (projectIds.size > 0) {
      const projects = await this.prisma.project.findMany({
        where: { id: { in: [...projectIds] } },
        select: { id: true, organizationId: true },
      });
      if (projects.length !== projectIds.size) throw new NotFoundException('Project not found');
      for (const p of projects) orgIds.add(p.organizationId);
    }

    for (const orgId of orgIds) {
      if (!joinedOrgs.has(orgId)) throw new ForbiddenException('No access to this organization');
    }
    return true;
  }
}

function collect(value: unknown, into: Set<string>) {
  if (typeof value === 'string' && value) into.add(value);
  else if (Array.isArray(value)) for (const v of value) if (typeof v === 'string' && v) into.add(v);
}
