import { NextResponse } from "next/server";
import { getApiKeyContext, type ApiKeyBusinessContext } from "@/lib/auth/apiKeyContext";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { requirePermission, ForbiddenError } from "@/lib/rbac/can";
import type { ModuleKey, ActionKey } from "@/lib/rbac/permissions";

export class ApiKeyAuthError extends Error {
  constructor() {
    super("Invalid or missing API key");
    this.name = "ApiKeyAuthError";
  }
}

export class ApiKeyRateLimitedError extends Error {
  constructor() {
    super("Rate limit exceeded");
    this.name = "ApiKeyRateLimitedError";
  }
}

const RATE_LIMIT_PER_MINUTE = 120;

/**
 * The app/api/v1/* equivalent of `getApiBusinessContext()` + `requirePermission()` together:
 * authenticates the Bearer API key, rate-limits per key (not per IP — a key is the meaningful
 * caller identity here), and enforces the exact same RBAC check the UI uses via the key's linked
 * Role. Throws on any failure so route handlers stay a single try/catch around one call.
 */
export async function requireApiV1Context(
  request: Request,
  moduleKey: ModuleKey,
  action: ActionKey,
): Promise<ApiKeyBusinessContext> {
  const context = await getApiKeyContext(request);
  if (!context) throw new ApiKeyAuthError();
  if (!checkRateLimit(`apiv1:${context.apiKeyId}`, RATE_LIMIT_PER_MINUTE, 60_000)) {
    throw new ApiKeyRateLimitedError();
  }
  requirePermission(context.membership, moduleKey, action);
  return context;
}

export function apiV1ErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiKeyAuthError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof ApiKeyRateLimitedError) {
    return NextResponse.json({ error: err.message }, { status: 429 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
