import { describe, expect, it } from "vitest";
import { can, requirePermission, ForbiddenError, type MembershipContext } from "@/lib/rbac/can";
import { emptyPermissionMatrix } from "@/lib/rbac/permissions";

function membershipWith(overrides: { view?: boolean; edit?: boolean } = {}): MembershipContext {
  const permissions = emptyPermissionMatrix();
  permissions.gst = { ...permissions.gst, ...overrides } as Record<string, boolean>;
  return {
    membershipId: "m1",
    businessId: "b1",
    userId: "u1",
    status: "active",
    permissions: permissions as MembershipContext["permissions"],
  };
}

describe("can — gst module", () => {
  it("allows gst.view when granted", () => {
    const membership = membershipWith({ view: true });
    expect(can(membership, "gst", "view")).toBe(true);
  });

  it("denies gst.edit for a view-only membership", () => {
    const membership = membershipWith({ view: true, edit: false });
    expect(can(membership, "gst", "edit")).toBe(false);
  });

  it("denies every permission for a deactivated membership, even if granted in the matrix", () => {
    const membership = { ...membershipWith({ view: true, edit: true }), status: "deactivated" as const };
    expect(can(membership, "gst", "view")).toBe(false);
    expect(can(membership, "gst", "edit")).toBe(false);
  });
});

describe("requirePermission — gst module", () => {
  it("throws ForbiddenError when a view-only membership attempts a mutating gst action", () => {
    const membership = membershipWith({ view: true, edit: false });
    expect(() => requirePermission(membership, "gst", "edit")).toThrow(ForbiddenError);
  });

  it("does not throw when the permission is granted", () => {
    const membership = membershipWith({ view: true, edit: true });
    expect(() => requirePermission(membership, "gst", "edit")).not.toThrow();
  });
});
