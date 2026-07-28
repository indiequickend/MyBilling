import {
  isValidAction,
  isValidModule,
  type ActionKey,
  type ModuleKey,
} from "@/lib/rbac/permissions";
import type { PermissionMatrix } from "@/lib/db/models/Role";

export type MembershipContext = {
  membershipId: string;
  businessId: string;
  userId: string;
  status: "active" | "deactivated";
  permissions: PermissionMatrix;
};

export function can(
  membership: Pick<MembershipContext, "status" | "permissions">,
  moduleKey: ModuleKey,
  action: ActionKey,
): boolean {
  if (membership.status !== "active") return false;
  if (!isValidModule(moduleKey) || !isValidAction(moduleKey, action)) return false;
  return membership.permissions?.[moduleKey]?.[action] === true;
}

export class ForbiddenError extends Error {
  constructor(moduleKey: string, action: string) {
    super(`Missing permission: ${moduleKey}.${action}`);
    this.name = "ForbiddenError";
  }
}

/** Throws ForbiddenError (never a silent no-op) when the check fails. */
export function requirePermission(
  membership: Pick<MembershipContext, "status" | "permissions">,
  moduleKey: ModuleKey,
  action: ActionKey,
): void {
  if (!can(membership, moduleKey, action)) {
    throw new ForbiddenError(moduleKey, action);
  }
}
