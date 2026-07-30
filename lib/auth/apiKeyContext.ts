import { hashToken } from "@/lib/auth/tokens";
import { findActiveApiKeyByHash, touchApiKeyLastUsed } from "@/lib/db/queries/apiKeys";
import { findRoleById } from "@/lib/db/queries/roles";
import type { MembershipContext } from "@/lib/rbac/can";

export type ApiKeyBusinessContext = {
  businessId: string;
  apiKeyId: string;
  membership: MembershipContext;
  /** The user who created this API key — used to attribute writes made through the API (an
   * ApiKey has no session/user of its own to attribute them to). */
  createdByUserId: string;
};

/**
 * The Bearer-token equivalent of getApiBusinessContext() (lib/auth/apiContext.ts) — resolves an
 * `Authorization: Bearer <key>` header to a business + a synthetic MembershipContext built from
 * the key's linked Role, so app/api/v1/* routes can call the exact same requirePermission() the
 * cookie-authenticated UI/routes use, unchanged.
 *
 * No CSRF check applies to Bearer-token auth: CSRF exploits a browser automatically attaching
 * cookies to a cross-site request, which never happens for an explicitly-set Authorization header
 * — there's no session to ride on.
 */
export async function getApiKeyContext(request: Request): Promise<ApiKeyBusinessContext | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
  if (!match) return null;
  const rawKey = match[1];

  const apiKey = await findActiveApiKeyByHash(hashToken(rawKey));
  if (!apiKey) return null;

  const role = await findRoleById(String(apiKey.roleId), String(apiKey.businessId));
  if (!role) return null;

  // Fire-and-forget: a slow/failed "last used" write must never block or fail the actual request.
  void touchApiKeyLastUsed(String(apiKey._id)).catch(() => {});

  return {
    businessId: String(apiKey.businessId),
    apiKeyId: String(apiKey._id),
    createdByUserId: String(apiKey.createdByUserId),
    membership: {
      membershipId: "",
      businessId: String(apiKey.businessId),
      userId: String(apiKey.createdByUserId),
      status: "active",
      permissions: role.permissions,
    },
  };
}
