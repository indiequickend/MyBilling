import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "./helpers/twoTenants";
import { createPaymentLink, findValidPaymentLinkByTokenHash, revokePaymentLink } from "@/lib/db/queries/paymentLinks";
import { hashToken } from "@/lib/auth/tokens";
import { PaymentLink } from "@/lib/db/models/PaymentLink";

describe("payment links — public token validation", () => {
  let tenants: TwoTenants;

  beforeAll(async () => {
    tenants = await setupTwoTenants("payment-link-token");
  });

  afterAll(async () => {
    await PaymentLink.deleteMany({ businessId: tenants.businessAId });
    await teardownTwoTenants(tenants);
  });

  it("a valid, unexpired, unrevoked link resolves", async () => {
    const created = await createPaymentLink({
      businessId: tenants.businessAId,
      amountMinor: 10_000,
      expiresAt: new Date(Date.now() + 60_000),
      createdByUserId: tenants.userAId,
    });
    if (!created.ok) throw new Error("setup failed");

    const found = await findValidPaymentLinkByTokenHash(hashToken(created.token));
    expect(found).not.toBeNull();
    expect(found?.amountMinor).toBe(10_000);
  });

  it("a tampered token never resolves, even though a valid link exists", async () => {
    const created = await createPaymentLink({
      businessId: tenants.businessAId,
      amountMinor: 10_000,
      expiresAt: new Date(Date.now() + 60_000),
      createdByUserId: tenants.userAId,
    });
    if (!created.ok) throw new Error("setup failed");

    const tampered = created.token.slice(0, -1) + (created.token.at(-1) === "a" ? "b" : "a");
    const found = await findValidPaymentLinkByTokenHash(hashToken(tampered));
    expect(found).toBeNull();
  });

  it("an expired link is rejected and never resolves again on retry", async () => {
    const created = await createPaymentLink({
      businessId: tenants.businessAId,
      amountMinor: 10_000,
      expiresAt: new Date(Date.now() - 1_000),
      createdByUserId: tenants.userAId,
    });
    if (!created.ok) throw new Error("setup failed");

    const firstAttempt = await findValidPaymentLinkByTokenHash(hashToken(created.token));
    expect(firstAttempt).toBeNull();
    const secondAttempt = await findValidPaymentLinkByTokenHash(hashToken(created.token));
    expect(secondAttempt).toBeNull();
  });

  it("a revoked link is rejected even before its expiry", async () => {
    const created = await createPaymentLink({
      businessId: tenants.businessAId,
      amountMinor: 10_000,
      expiresAt: new Date(Date.now() + 60_000),
      createdByUserId: tenants.userAId,
    });
    if (!created.ok) throw new Error("setup failed");

    const revoked = await revokePaymentLink(String(created.paymentLink._id), tenants.businessAId);
    expect(revoked.ok).toBe(true);

    const found = await findValidPaymentLinkByTokenHash(hashToken(created.token));
    expect(found).toBeNull();
  });
});
