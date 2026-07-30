import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createPaymentLink, revokePaymentLink } from "@/lib/db/queries/paymentLinks";
import { listShareHistory } from "@/lib/db/queries/shareHistory";
import { PaymentLink } from "@/lib/db/models/PaymentLink";

describe("share history — tenant isolation", () => {
  let tenants: TwoTenants;

  beforeAll(async () => {
    tenants = await setupTwoTenants("share-history");
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await PaymentLink.deleteMany({ businessId: { $in: businessIds } });
    await teardownTwoTenants(tenants);
  });

  it("listShareHistory returns Payment Link creation events with derived status, scoped per business", async () => {
    const active = await createPaymentLink({
      businessId: tenants.businessAId,
      amountMinor: 15_000,
      note: "Deposit",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdByUserId: tenants.userAId,
    });
    const expired = await createPaymentLink({
      businessId: tenants.businessAId,
      amountMinor: 5_000,
      expiresAt: new Date(Date.now() - 1000),
      createdByUserId: tenants.userAId,
    });
    const otherBusiness = await createPaymentLink({
      businessId: tenants.businessBId,
      amountMinor: 999_999,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdByUserId: tenants.userBId,
    });
    if (!active.ok || !expired.ok || !otherBusiness.ok) throw new Error("setup failed");

    const revoked = await revokePaymentLink(String(active.paymentLink._id), tenants.businessAId);
    expect(revoked.ok).toBe(true);

    const result = await listShareHistory(tenants.businessAId);
    expect(result.items.every((i) => i.amountMinor !== 999_999)).toBe(true);

    const revokedEntry = result.items.find((i) => i.paymentLinkId === String(active.paymentLink._id));
    expect(revokedEntry?.status).toBe("revoked");

    const expiredEntry = result.items.find((i) => i.paymentLinkId === String(expired.paymentLink._id));
    expect(expiredEntry?.status).toBe("expired");
  });
});
