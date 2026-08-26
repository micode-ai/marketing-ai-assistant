import { readFileSync } from 'fs';
import { join } from 'path';
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

describe('the ordering field exists in the schema', () => {
  // A mocked findMany accepts any arguments, so the unit tests below passed
  // happily while production threw PrismaClientValidationError: the join table
  // has no createdAt. This reads the schema instead of trusting the mock.
  const schema = readFileSync(
    join(__dirname, '../../../../packages/database/prisma/schema.prisma'),
    'utf-8',
  );

  function modelBlock(name: string): string {
    const match = schema.match(new RegExp(String.raw`^model ${name} \{([\s\S]*?)^\}`, 'm'));
    if (!match) throw new Error(`model ${name} not found in schema`);
    return match[1];
  }

  function fieldNames(block: string): string[] {
    return block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('@@') && !line.startsWith('//'))
      .map((line) => line.split(/\s+/)[0]);
  }

  it('validates the orderBy the helper actually passes against the schema', async () => {
    // The point of the whole block: not "the schema looks like this" but "the
    // argument we send names something that exists". A mocked client would
    // accept `orderBy: { nonsense: 'asc' }` without a murmur.
    const prisma = makePrisma([account()]);
    await listProjectSocialAccounts(prisma as any, 'proj_1', 'INSTAGRAM');

    const args = prisma.projectSocialAccount.findMany.mock.calls[0][0];
    const linkFields = fieldNames(modelBlock('ProjectSocialAccount'));

    for (const [key, value] of Object.entries(args.orderBy as Record<string, unknown>)) {
      expect(linkFields).toContain(key);
      // Ordering through a relation must name a field of the related model.
      if (typeof value === 'object' && value !== null) {
        const relatedModel = key === 'socialAccount' ? 'SocialAccount' : 'Project';
        for (const nested of Object.keys(value)) {
          expect(fieldNames(modelBlock(relatedModel))).toContain(nested);
        }
      }
    }
  });

  it('ProjectSocialAccount still has no timestamp of its own', () => {
    const fields = fieldNames(modelBlock('ProjectSocialAccount'));

    expect(fields).not.toContain('createdAt');
    // If one is ever added, ordering can move back to the link itself — and
    // this failing test is the reminder to consider it.
    expect(fields).toEqual(expect.arrayContaining(['projectId', 'socialAccountId', 'socialAccount']));
  });

  it('SocialAccount has the createdAt the helper orders by', () => {
    expect(fieldNames(modelBlock('SocialAccount'))).toContain('createdAt');
  });
});

describe('listProjectSocialAccounts', () => {
  it('asks the database for a stable order', async () => {
    // The bug being fixed: findMany with no orderBy meant the default account
    // could change between two identical requests.
    const prisma = makePrisma([account()]);

    await listProjectSocialAccounts(prisma as any, 'proj_1', 'INSTAGRAM');

    // Ordered by the account's own timestamp: the join table has no columns
    // besides the two ids, and ordering by a field it lacks made Prisma reject
    // the query outright — which took the channel status endpoints down.
    expect(prisma.projectSocialAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { socialAccount: { createdAt: 'asc' } } }),
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
