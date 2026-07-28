import { getSessionFromCookie } from "@/lib/auth/session";
import { findUserById } from "@/lib/db/queries/users";
import { findMembership } from "@/lib/db/queries/memberships";
import { findRoleById } from "@/lib/db/queries/roles";
import type { MembershipContext } from "@/lib/rbac/can";

/** Resolves the current request's session cookie to a (non-deleted) User, or null. */
export async function getCurrentUser() {
  const session = await getSessionFromCookie();
  if (!session) return null;

  const user = await findUserById(String(session.userId));
  if (!user) return null;

  return user;
}

/**
 * Resolves the current user's membership + permissions for one business, or
 * null if they have no (active) membership there. Callers decide what "null"
 * means for their route (redirect, 403, etc.) — this stays framework-agnostic.
 */
export async function getActiveMembership(businessId: string): Promise<MembershipContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const membership = await findMembership(String(user._id), businessId);
  if (!membership || membership.status !== "active") return null;

  const role = await findRoleById(String(membership.roleId), businessId);
  if (!role) return null;

  return {
    membershipId: String(membership._id),
    businessId,
    userId: String(user._id),
    status: membership.status,
    permissions: role.permissions,
  };
}
