import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  createPaymentLink,
  findValidPaymentLinkByTokenHash,
  listPaymentLinks,
  findPaymentLinkById,
  revokePaymentLink,
} from "@/lib/db/queries/paymentLinks";
import { hashToken } from "@/lib/auth/tokens";
import { PaymentLink } from "@/lib/db/models/PaymentLink";

describe("payment links — tenant isolation", () => {
  let tenants: TwoTenants;
  let linkAId: string;
  let tokenA: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("payment-links");

    const created = await createPaymentLink({
      businessId: tenants.businessAId,
      amountMinor: 50_000,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdByUserId: tenants.userAId,
    });
    if (!created.ok) throw new Error("setup failed");
    linkAId = String(created.paymentLink._id);
    tokenA = created.token;
  });

  afterAll(async () => {
    await PaymentLink.deleteMany({ businessId: { $in: [tenants.businessAId, tenants.businessBId] } });
    await teardownTwoTenants(tenants);
  });

  it("findPaymentLinkById never returns another business's link", async () => {
    const ownFind = await findPaymentLinkById(linkAId, tenants.businessAId);
    expect(ownFind).not.toBeNull();

    const crossFind = await findPaymentLinkById(linkAId, tenants.businessBId);
    expect(crossFind).toBeNull();
  });

  it("listPaymentLinks only returns the caller's own links", async () => {
    const { items } = await listPaymentLinks(tenants.businessAId);
    expect(items.map((l) => String(l._id))).toContain(linkAId);

    const crossed = await listPaymentLinks(tenants.businessBId);
    expect(crossed.items.map((l) => String(l._id))).not.toContain(linkAId);
  });

  it("revokePaymentLink cannot revoke another business's link", async () => {
    const result = await revokePaymentLink(linkAId, tenants.businessBId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");

    // still valid/openable after the cross-tenant revoke attempt
    const valid = await findValidPaymentLinkByTokenHash(hashToken(tokenA));
    expect(valid).not.toBeNull();
  });

  it("revokePaymentLink by the owning business makes the token invalid", async () => {
    const result = await revokePaymentLink(linkAId, tenants.businessAId);
    expect(result.ok).toBe(true);

    const valid = await findValidPaymentLinkByTokenHash(hashToken(tokenA));
    expect(valid).toBeNull();
  });
});

describe("payment links — expiry", () => {
  let tenants: TwoTenants;

  beforeAll(async () => {
    tenants = await setupTwoTenants("payment-links-expiry");
  });

  afterAll(async () => {
    await PaymentLink.deleteMany({ businessId: tenants.businessAId });
    await teardownTwoTenants(tenants);
  });

  it("findValidPaymentLinkByTokenHash rejects an already-expired link", async () => {
    const created = await createPaymentLink({
      businessId: tenants.businessAId,
      amountMinor: 25_000,
      expiresAt: new Date(Date.now() - 60_000),
      createdByUserId: tenants.userAId,
    });
    if (!created.ok) throw new Error("setup failed");

    const valid = await findValidPaymentLinkByTokenHash(hashToken(created.token));
    expect(valid).toBeNull();
  });
});
