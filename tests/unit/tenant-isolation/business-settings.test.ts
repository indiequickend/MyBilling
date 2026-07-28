import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  findBusinessById,
  updateBusinessDetails,
  setBusinessCustomFieldDefs,
  setBusinessCustomFieldValues,
  updateDocumentPreferences,
  updateProductsInventoryPreferences,
} from "@/lib/db/queries/businesses";

describe("business settings — tenant isolation", () => {
  let tenants: TwoTenants;

  beforeAll(async () => {
    tenants = await setupTwoTenants("business-settings");
  });

  afterAll(async () => {
    await teardownTwoTenants(tenants);
  });

  it("updateBusinessDetails only affects the targeted business", async () => {
    await updateBusinessDetails(tenants.businessAId, { brandName: "A's Brand" });

    const businessA = await findBusinessById(tenants.businessAId);
    const businessB = await findBusinessById(tenants.businessBId);
    expect(businessA?.brandName).toBe("A's Brand");
    expect(businessB?.brandName).toBeUndefined();
  });

  it("setBusinessCustomFieldDefs only affects the targeted business", async () => {
    const defs = [
      { key: "msme_no", label: "MSME Registration", type: "text" as const, required: false },
    ];
    await setBusinessCustomFieldDefs(tenants.businessAId, defs);

    const businessA = await findBusinessById(tenants.businessAId);
    const businessB = await findBusinessById(tenants.businessBId);
    expect(businessA?.customFieldDefs).toHaveLength(1);
    expect(businessB?.customFieldDefs ?? []).toHaveLength(0);
  });

  it("setBusinessCustomFieldValues only affects the targeted business", async () => {
    await setBusinessCustomFieldValues(tenants.businessAId, { msme_no: "UDYAM-XYZ" });

    const businessA = await findBusinessById(tenants.businessAId);
    const businessB = await findBusinessById(tenants.businessBId);
    expect(businessA?.customFieldValues?.msme_no).toBe("UDYAM-XYZ");
    expect(businessB?.customFieldValues?.msme_no).toBeUndefined();
  });

  it("updateDocumentPreferences only affects the targeted business", async () => {
    const prefs = {
      roundOff: false,
      defaultDiscountType: "amount" as const,
      showHeaderFieldSuggestions: false,
      defaultDueDateDays: 30,
    };
    await updateDocumentPreferences(tenants.businessAId, {
      sales: prefs,
      purchases: prefs,
      conversions: prefs,
    });

    const businessA = await findBusinessById(tenants.businessAId);
    const businessB = await findBusinessById(tenants.businessBId);
    expect(businessA?.preferences.document.sales.defaultDueDateDays).toBe(30);
    expect(businessB?.preferences.document.sales.defaultDueDateDays).not.toBe(30);
  });

  it("updateProductsInventoryPreferences only affects the targeted business", async () => {
    await updateProductsInventoryPreferences(tenants.businessAId, {
      product: {
        defaultItemType: "service",
        defaultPriceInclusiveOfTax: true,
        maxDiscountPercent: 50,
        defaultUnit: "HRS",
        defaultTaxRatePercent: 18,
      },
      inventory: { trackInventory: false },
      batch: { batchTrackingEnabledByDefault: true, expiryTrackingEnabledByDefault: true },
    });

    const businessA = await findBusinessById(tenants.businessAId);
    const businessB = await findBusinessById(tenants.businessBId);
    expect(businessA?.preferences.productsInventory.product.defaultUnit).toBe("HRS");
    expect(businessB?.preferences.productsInventory.product.defaultUnit).not.toBe("HRS");
  });
});
