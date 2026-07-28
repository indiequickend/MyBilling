import { describe, expect, it } from "vitest";
import {
  PERMISSION_CATALOG,
  STANDARD_MODULES,
  STANDARD_ACTIONS,
  emptyPermissionMatrix,
  isValidModule,
  isValidAction,
} from "@/lib/rbac/permissions";
import { ADMIN_TEMPLATE_PERMISSIONS, ACCOUNTS_TEMPLATE_PERMISSIONS } from "@/lib/rbac/templates";
import { can, requirePermission, ForbiddenError, type MembershipContext } from "@/lib/rbac/can";

describe("permission catalog", () => {
  it("covers every standard module with the standard actions", () => {
    for (const moduleKey of STANDARD_MODULES) {
      expect(PERMISSION_CATALOG[moduleKey]).toEqual(STANDARD_ACTIONS);
    }
  });

  it("emptyPermissionMatrix denies everything by default", () => {
    const matrix = emptyPermissionMatrix();
    for (const [moduleKey, actions] of Object.entries(PERMISSION_CATALOG)) {
      for (const action of actions) {
        expect(matrix[moduleKey][action]).toBe(false);
      }
    }
  });

  it("rejects unknown modules/actions", () => {
    expect(isValidModule("not_a_module")).toBe(false);
    expect(isValidModule("sales_invoices")).toBe(true);
    expect(isValidAction("sales_invoices", "not_an_action")).toBe(false);
    expect(isValidAction("sales_invoices", "view")).toBe(true);
    expect(isValidAction("settings", "manage_users")).toBe(true);
    expect(isValidAction("settings", "view")).toBe(false); // settings has its own action set
  });
});

describe("can / requirePermission", () => {
  const activeAdmin: Pick<MembershipContext, "status" | "permissions"> = {
    status: "active",
    permissions: ADMIN_TEMPLATE_PERMISSIONS,
  };
  const activeAccounts: Pick<MembershipContext, "status" | "permissions"> = {
    status: "active",
    permissions: ACCOUNTS_TEMPLATE_PERMISSIONS,
  };
  const deactivatedAdmin: Pick<MembershipContext, "status" | "permissions"> = {
    status: "deactivated",
    permissions: ADMIN_TEMPLATE_PERMISSIONS,
  };

  it("grants everything to the Admin template", () => {
    expect(can(activeAdmin, "sales_invoices", "delete")).toBe(true);
    expect(can(activeAdmin, "settings", "manage_roles")).toBe(true);
  });

  it("denies actions outside a scoped template", () => {
    expect(can(activeAccounts, "sales_invoices", "create")).toBe(false);
    expect(can(activeAccounts, "expenses", "create")).toBe(true);
  });

  it("denies everything for a deactivated membership regardless of permissions", () => {
    expect(can(deactivatedAdmin, "sales_invoices", "view")).toBe(false);
  });

  it("denies unknown module/action pairs even if somehow present in data", () => {
    const tampered: Pick<MembershipContext, "status" | "permissions"> = {
      status: "active",
      permissions: { not_a_module: { view: true } },
    };
    expect(can(tampered, "not_a_module" as never, "view" as never)).toBe(false);
  });

  it("requirePermission throws ForbiddenError instead of silently no-op'ing", () => {
    expect(() => requirePermission(activeAccounts, "sales_invoices", "create")).toThrow(
      ForbiddenError,
    );
    expect(() => requirePermission(activeAdmin, "sales_invoices", "create")).not.toThrow();
  });
});
