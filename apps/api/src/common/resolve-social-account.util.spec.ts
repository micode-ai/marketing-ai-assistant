import {
  listProjectSocialAccounts,
  resolveProjectSocialAccount,
  toAccountOptions,
  ResolvedSocialAccount,
} from './resolve-social-account.util';

const account = (over: Partial<ResolvedSocialAccount> = {}): ResolvedSocialAccount => ({
  id: 'sa_1',
  organizationId: 'org_1',
  platform: 'INSTAGRAM',
  accountName: 'first',
  accountId: 'ig_1',
  encryptedTokens: 'enc',
  scopes: [],
  ...over,
});

function makePrisma(accounts: ResolvedSocialAccount[], organizationId = 'org_1') {
  return {
    project: {
      findUnique: jest.fn().mockResolvedValue(organizationId ? { organizationId } : null),
    },
    projectSocialAccount: {
      findMany: jest.fn().mockResolvedValue(accounts.map((socialAccount) => ({ socialAccount }))),
    },
  };
}

describe('listProjectSocialAccounts', () => {
  it('asks the database for a stable order', async () => {
    // The bug being fixed: findMany with no orderBy meant the default account
    // could change between two identical requests.
    const prisma = makePrisma([account()]);

    await listProjectSocialAccounts(prisma as any, 'proj_1', 'INSTAGRAM');

    expect(prisma.projectSocialAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
    );
  });

  it('returns every account of the platform, not just one', async () => {
    const prisma = makePrisma([
      account({ id: 'a', accountName: 'first' }),
      account({ id: 'b', accountName: 'second' }),
    ]);

    const accounts = await listProjectSocialAccounts(prisma as any, 'proj_1', 'INSTAGRAM');

    expect(accounts.map((a) => a.accountName)).toEqual(['first', 'second']);
  });

  it('filters out other platforms and other organizations', async () => {
    const prisma = makePrisma([
      account({ id: 'a' }),
      account({ id: 'b', platform: 'THREADS' }),
      account({ id: 'c', organizationId: 'org_2' }),
    ]);

    const accounts = await listProjectSocialAccounts(prisma as any, 'proj_1', 'INSTAGRAM');

    expect(accounts.map((a) => a.id)).toEqual(['a']);
  });

  it('returns nothing when the project does not exist', async () => {
    const prisma = makePrisma([account()], '');

    expect(await listProjectSocialAccounts(prisma as any, 'nope', 'INSTAGRAM')).toEqual([]);
  });
});

describe('resolveProjectSocialAccount', () => {
  it('defaults to the oldest linked account', async () => {
    const prisma = makePrisma([
      account({ id: 'a', accountName: 'first' }),
      account({ id: 'b', accountName: 'second' }),
    ]);

    const resolved = await resolveProjectSocialAccount(prisma as any, 'proj_1', 'INSTAGRAM');

    expect(resolved?.accountName).toBe('first');
  });

  it('returns the account that was asked for', async () => {
    const prisma = makePrisma([
      account({ id: 'a', accountName: 'first' }),
      account({ id: 'b', accountName: 'second' }),
    ]);

    const resolved = await resolveProjectSocialAccount(prisma as any, 'proj_1', 'INSTAGRAM', 'b');

    expect(resolved?.accountName).toBe('second');
  });

  it('refuses an account that is not linked instead of falling back', async () => {
    // Falling back would answer a question about account X with account Y's
    // numbers, which is worse than saying it is not there.
    const prisma = makePrisma([account({ id: 'a' })]);

    expect(
      await resolveProjectSocialAccount(prisma as any, 'proj_1', 'INSTAGRAM', 'other'),
    ).toBeNull();
  });

  it('returns null when the channel is not connected at all', async () => {
    const prisma = makePrisma([]);

    expect(await resolveProjectSocialAccount(prisma as any, 'proj_1', 'INSTAGRAM')).toBeNull();
  });
});

describe('toAccountOptions', () => {
  it('exposes only what a switcher needs — no tokens', async () => {
    const options = toAccountOptions([account({ id: 'a', accountName: 'micode' })]);

    expect(options).toEqual([{ id: 'a', accountName: 'micode', accountId: 'ig_1' }]);
    expect(JSON.stringify(options)).not.toContain('enc');
  });
});
