import { cache } from "react";
import { getCurrentUser, getActiveMembership } from "@/lib/auth/context";
import { listBusinessesForUser } from "@/lib/db/queries/businesses";
import { getActiveBusinessIdCookie } from "@/lib/auth/activeBusiness";
import type { MembershipContext } from "@/lib/rbac/can";

export type DashboardContext = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  businesses: Awaited<ReturnType<typeof listBusinessesForUser>>;
  activeBusinessId: string | null;
  membership: MembershipContext | null;
};

/**
 * Resolves everything a dashboard page needs from the current request's
 * session: the user, every business they belong to, which one is "active"
 * (from a cookie, defaulting to the first), and their membership/permissions
 * for it. Wrapped in React's `cache()` so the layout and the page it wraps
 * both calling this only hits the database once per request.
 */
export const getDashboardContext = cache(async (): Promise<DashboardContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const businesses = await listBusinessesForUser(String(user._id));
  if (businesses.length === 0) {
    return { user, businesses: [], activeBusinessId: null, membership: null };
  }

  const cookieId = await getActiveBusinessIdCookie();
  const active = businesses.find((b) => String(b._id) === cookieId) ?? businesses[0];
  const activeBusinessId = String(active._id);
  const membership = await getActiveMembership(activeBusinessId);

  return { user, businesses, activeBusinessId, membership };
});

/** The active business's fiscal-year start month (1-12), for date-range presets like "FY 25-26" —
 * `context.businesses` is already fetched by getDashboardContext, so this adds no extra query. */
export function getActiveBusinessFyStartMonth(context: DashboardContext): number {
  const business = context.businesses.find((b) => String(b._id) === context.activeBusinessId);
  return business?.preferences?.documentNumbering?.fyStartMonth ?? 4;
}
