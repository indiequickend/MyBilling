import { getCurrentUser, getActiveMembership } from "@/lib/auth/context";
import { getActiveBusinessIdCookie } from "@/lib/auth/activeBusiness";
import { listBusinessesForUser } from "@/lib/db/queries/businesses";

/**
 * The API-route equivalent of `getDashboardContext()` — Route Handlers aren't
 * wrapped by the dashboard layout, so they resolve the active business the
 * same way it does: from the `active_business_id` cookie if present,
 * otherwise defaulting to the user's first business. Without this fallback, a
 * user who logged in but never visited a page that sets the cookie would get
 * an inexplicable 401 from every API route despite the UI working fine.
 */
export async function getApiBusinessContext() {
  const user = await getCurrentUser();
  if (!user) return null;

  const cookieId = await getActiveBusinessIdCookie();
  const businesses = await listBusinessesForUser(String(user._id));
  if (businesses.length === 0) return null;

  const businessId =
    cookieId && businesses.some((b) => String(b._id) === cookieId)
      ? cookieId
      : String(businesses[0]._id);

  const membership = await getActiveMembership(businessId);
  if (!membership) return null;

  return { user, businessId, membership };
}
