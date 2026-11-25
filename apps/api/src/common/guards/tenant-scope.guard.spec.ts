import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantScopeGuard } from './tenant-scope.guard';
import { TENANT_RESOURCE_KEY } from '../decorators/tenant-resource.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const MY_ORG = 'org-mine';
const OTHER_ORG = 'org-other';

function makePrisma() {
  const projects: Record<string, string> = { 'p-mine': MY_ORG, 'p-other': OTHER_ORG };
  return {
    project: {
      findUnique: jest.fn(async ({ where }: any) => (projects[where.id] ? { organizationId: projects[where.id] } : null)),
      findMany: jest.fn(async ({ where }: any) =>
        where.id.in.filter((id: string) => projects[id]).map((id: string) => ({ id, organizationId: projects[id] })),
      ),
    },
    webhook: {
      findUnique: jest.fn(async ({ where }: any) =>
        ({ 'w-mine': { organizationId: MY_ORG }, 'w-other': { organizationId: OTHER_ORG } } as any)[where.id] ?? null,
      ),
    },
    emailList: {
      findUnique: jest.fn(async ({ where }: any) =>
        ({ 'l-mine': { projectId: 'p-mine', organizationId: null }, 'l-other': { projectId: 'p-other', organizationId: null } } as any)[where.id] ?? null,
      ),
    },
  } as any;
}

function ctx(req: any, meta: Record<string, unknown> = {}) {
  const reflector = { getAllAndOverride: jest.fn((key: string) => meta[key]) } as unknown as Reflector;
  const context = {
    getType: () => 'http',
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
  return { reflector, context };
}

const user = (memberships: any[]) => ({ id: 'u1', memberships });
const joined = { organizationId: MY_ORG, joinedAt: new Date() };

async function run(req: any, meta: Record<string, unknown> = {}) {
  const { reflector, context } = ctx(req, meta);
  return new TenantScopeGuard(reflector, makePrisma()).canActivate(context);
}

describe('TenantScopeGuard', () => {
  it('lets public routes through', async () => {
    await expect(run({ query: { organizationId: OTHER_ORG } }, { [IS_PUBLIC_KEY]: true })).resolves.toBe(true);
  });

  it('allows an organizationId the user has joined', async () => {
    await expect(run({ user: user([joined]), query: { organizationId: MY_ORG } })).resolves.toBe(true);
  });

  it('refuses an organizationId from another organization (query, body, params)', async () => {
    for (const where of ['query', 'body', 'params']) {
      await expect(run({ user: user([joined]), [where]: { organizationId: OTHER_ORG } })).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('refuses a pending membership (requested, not joined)', async () => {
    await expect(
      run({ user: user([{ organizationId: MY_ORG, joinedAt: null }]), query: { organizationId: MY_ORG } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('checks a projectId through its organization', async () => {
    await expect(run({ user: user([joined]), query: { projectId: 'p-mine' } })).resolves.toBe(true);
    await expect(run({ user: user([joined]), query: { projectId: 'p-other' } })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run({ user: user([joined]), query: { projectId: 'p-missing' } })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves a route param mapped by @TenantResource', async () => {
    const meta = { [TENANT_RESOURCE_KEY]: { id: 'webhook' } };
    await expect(run({ user: user([joined]), params: { id: 'w-mine' } }, meta)).resolves.toBe(true);
    await expect(run({ user: user([joined]), params: { id: 'w-other' } }, meta)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run({ user: user([joined]), params: { id: 'w-missing' } }, meta)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves body ids, including arrays, through their parent project', async () => {
    const meta = { [TENANT_RESOURCE_KEY]: { 'body.listId': 'emailList' } };
    await expect(run({ user: user([joined]), body: { listId: 'l-mine' } }, meta)).resolves.toBe(true);
    await expect(run({ user: user([joined]), body: { listId: ['l-mine', 'l-other'] } }, meta)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignores a mapped field that is absent', async () => {
    const meta = { [TENANT_RESOURCE_KEY]: { id: 'webhook' } };
    await expect(run({ user: user([joined]), params: {} }, meta)).resolves.toBe(true);
  });
});
