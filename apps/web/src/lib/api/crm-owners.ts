import { api } from './client';

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
}

export async function loadActiveMembers(orgId: string): Promise<TeamMember[]> {
  try {
    const org = await api.get<{ members: Array<{
      userId: string;
      joinedAt: string | null;
      user?: { name?: string | null; email?: string | null } | null;
    }> }>(`/organizations/${orgId}`);
    return (org.members ?? [])
      .filter((m) => !!m.joinedAt)
      .map((m) => ({
        userId: m.userId,
        name: m.user?.name ?? m.user?.email ?? m.userId,
        email: m.user?.email ?? '',
      }));
  } catch {
    return [];
  }
}

export function ownerName(
  members: TeamMember[],
  ownerId: string | null | undefined,
  fallback: string,
): string {
  if (!ownerId) return fallback;
  const member = members.find((m) => m.userId === ownerId);
  return member?.name ?? fallback;
}
