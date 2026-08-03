import { describe, expect, it } from "vitest";
import { buildBottomTabItems, buildQuickCreateItems } from "@/lib/dashboard/navigation";
import { emptyPermissionMatrix } from "@/lib/rbac/permissions";
import type { MembershipContext } from "@/lib/rbac/can";

function membershipWith(grants: Partial<Record<string, Record<string, boolean>>> = {}): MembershipContext {
  const permissions = emptyPermissionMatrix();
  for (const [moduleKey, actions] of Object.entries(grants)) {
    permissions[moduleKey] = { ...permissions[moduleKey], ...actions };
  }
  return {
    membershipId: "m1",
    businessId: "b1",
    userId: "u1",
    status: "active",
    permissions: permissions as MembershipContext["permissions"],
  };
}

describe("buildBottomTabItems", () => {
  it("returns only Dashboard when no membership (no session)", () => {
    const items = buildBottomTabItems(null);
    expect(items.map((i) => i.label)).toEqual(["Dashboard"]);
  });

  it("includes every slot for a fully-permissioned membership, Parties preferring Customers", () => {
    const membership = membershipWith({
      sales_invoices: { view: true },
      payments: { view: true },
      customers: { view: true },
      vendors: { view: true },
    });
    const items = buildBottomTabItems(membership);
    expect(items.map((i) => i.label)).toEqual(["Dashboard", "Invoices", "Payments", "Parties"]);
    expect(items.find((i) => i.label === "Parties")?.href).toBe("/customers");
  });

  it("hides a slot outright rather than reflowing another item into it", () => {
    const membership = membershipWith({ payments: { view: true } });
    const items = buildBottomTabItems(membership);
    expect(items.map((i) => i.label)).toEqual(["Dashboard", "Payments"]);
  });

  it("falls back the Parties slot to Vendors when Customers isn't permitted", () => {
    const membership = membershipWith({ vendors: { view: true } });
    const items = buildBottomTabItems(membership);
    const parties = items.find((i) => i.label === "Parties");
    expect(parties?.href).toBe("/vendors");
  });

  it("omits Parties entirely when neither Customers nor Vendors is permitted", () => {
    const membership = membershipWith({ sales_invoices: { view: true } });
    const items = buildBottomTabItems(membership);
    expect(items.some((i) => i.label === "Parties")).toBe(false);
  });
});

describe("buildQuickCreateItems", () => {
  it("returns nothing for an unauthenticated context", () => {
    expect(buildQuickCreateItems(null)).toEqual([]);
  });

  it("gates each shortcut on its own create/view permission independently", () => {
    const membership = membershipWith({
      sales_invoices: { view: true, create: true },
      customers: { view: true, create: false },
      payments: { view: true },
    });
    const items = buildQuickCreateItems(membership);
    expect(items.map((i) => i.label)).toEqual(["Invoice", "Payments"]);
  });

  it("returns all three when fully permissioned", () => {
    const membership = membershipWith({
      sales_invoices: { create: true },
      customers: { create: true },
      payments: { view: true },
    });
    const items = buildQuickCreateItems(membership);
    expect(items.map((i) => i.label)).toEqual(["Invoice", "Customer", "Payments"]);
  });
});
