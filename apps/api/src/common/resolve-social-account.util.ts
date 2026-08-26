/**
 * Picks which connected account a project-scoped channel request is about.
 *
 * The three channel services each had their own copy of this, and each copy had
 * the same two faults: `findMany` with no `orderBy` followed by `.find(...)`, so
 * the winner was whichever row the database happened to return first, and no way
 * for a caller to ask for a different account. A project with two Instagram
 * accounts therefore showed one of them — not the first connected, not a
 * "primary", just whichever — and silently ignored the other.
 *
 * One implementation now, ordered by link creation so the default is stable, and
 * an optional `accountId` so the caller can pick.
 */

export interface ResolvedSocialAccount {
  id: string;
  organizationId: string;
  platform: string;
  accountName: string;
  accountId: string;
  encryptedTokens: string | null;
  scopes: string[];
}

export interface SocialAccountOption {
  id: string;
  accountName: string;
  accountId: string;
}

/**
 * Minimal shape of the Prisma client this helper needs.
 *
 * Loosely typed on purpose: Prisma's generated method signatures are generic
 * and do not structurally match a hand-written interface, so pinning the
 * argument and result types here makes PrismaService unassignable. The helper
 * narrows what it reads instead, which is the only place that knows what it
 * asked for.
 */
export interface SocialAccountPrisma {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project: { findUnique: (args: any) => Promise<any> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectSocialAccount: { findMany: (args: any) => Promise<any> };
}

/** Every account of this platform linked to the project, oldest link first. */
export async function listProjectSocialAccounts(
  prisma: SocialAccountPrisma,
  projectId: string,
  platform: string,
): Promise<ResolvedSocialAccount[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { organizationId: true },
  });
  if (!project) return [];

  const links = (await prisma.projectSocialAccount.findMany({
    where: { projectId },
    // Stable order: without it the "first" account changed between requests.
    orderBy: { createdAt: 'asc' },
    include: {
      socialAccount: {
        select: {
          id: true,
          organizationId: true,
          platform: true,
          accountName: true,
          accountId: true,
          encryptedTokens: true,
          scopes: true,
        },
      },
    },
  })) as Array<{ socialAccount: ResolvedSocialAccount }>;

  return links
    .map((l) => l.socialAccount)
    .filter(
      (account) =>
        account.platform === platform && account.organizationId === project.organizationId,
    );
}

/**
 * The account a request is about: the one asked for, or the oldest linked one.
 *
 * An `accountId` that is not linked to this project resolves to null rather than
 * falling back to the default — a caller asking about a specific account should
 * be told it is not there, not handed someone else's numbers.
 */
export async function resolveProjectSocialAccount(
  prisma: SocialAccountPrisma,
  projectId: string,
  platform: string,
  accountId?: string,
): Promise<ResolvedSocialAccount | null> {
  const accounts = await listProjectSocialAccounts(prisma, projectId, platform);
  if (accounts.length === 0) return null;
  if (!accountId) return accounts[0];
  return accounts.find((a) => a.id === accountId) ?? null;
}

/** The account list a dashboard needs to offer a switcher. */
export function toAccountOptions(accounts: ResolvedSocialAccount[]): SocialAccountOption[] {
  return accounts.map((a) => ({
    id: a.id,
    accountName: a.accountName,
    accountId: a.accountId,
  }));
}
