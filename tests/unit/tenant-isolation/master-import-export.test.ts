import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { findOrCreateProductCategoryByName } from "@/lib/db/queries/productCategories";
import { findOrCreateProductGroupByName } from "@/lib/db/queries/productGroups";
import { findOrCreatePartyGroupByName } from "@/lib/db/queries/partyGroups";
import { createProduct, listAllProducts } from "@/lib/db/queries/products";
import { createCustomer, listAllCustomers } from "@/lib/db/queries/customers";
import { createVendor, listAllVendors } from "@/lib/db/queries/vendors";
import { Product } from "@/lib/db/models/Product";
import { Customer } from "@/lib/db/models/Customer";
import { Vendor } from "@/lib/db/models/Vendor";
import { ProductCategory } from "@/lib/db/models/ProductCategory";
import { ProductGroup } from "@/lib/db/models/ProductGroup";
import { PartyGroup } from "@/lib/db/models/PartyGroup";

describe("bulk import/export masters — tenant isolation", () => {
  let tenants: TwoTenants;

  beforeAll(async () => {
    tenants = await setupTwoTenants("master-import-export");
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      Product.deleteMany({ businessId: { $in: businessIds } }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
      Vendor.deleteMany({ businessId: { $in: businessIds } }),
      ProductCategory.deleteMany({ businessId: { $in: businessIds } }),
      ProductGroup.deleteMany({ businessId: { $in: businessIds } }),
      PartyGroup.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("findOrCreateProductCategoryByName never resolves to a different business's category of the same name", async () => {
    const categoryB = await findOrCreateProductCategoryByName(tenants.businessBId, "Widgets");
    const categoryA = await findOrCreateProductCategoryByName(tenants.businessAId, "Widgets");
    expect(String(categoryA._id)).not.toBe(String(categoryB._id));
    expect(String(categoryA.businessId)).toBe(tenants.businessAId);

    // Calling again for Business A with the same name returns the same category (find, not
    // re-create) — proving the lookup is scoped correctly rather than accidentally always creating.
    const categoryAAgain = await findOrCreateProductCategoryByName(tenants.businessAId, "Widgets");
    expect(String(categoryAAgain._id)).toBe(String(categoryA._id));
  });

  it("findOrCreateProductGroupByName never resolves to a different business's group of the same name", async () => {
    const groupB = await findOrCreateProductGroupByName(tenants.businessBId, "Summer");
    const groupA = await findOrCreateProductGroupByName(tenants.businessAId, "Summer");
    expect(String(groupA._id)).not.toBe(String(groupB._id));
    expect(String(groupA.businessId)).toBe(tenants.businessAId);
  });

  it("findOrCreatePartyGroupByName never resolves across businesses or across customer/vendor type", async () => {
    const customerGroupA = await findOrCreatePartyGroupByName(tenants.businessAId, "customer", "VIP");
    const vendorGroupA = await findOrCreatePartyGroupByName(tenants.businessAId, "vendor", "VIP");
    const customerGroupB = await findOrCreatePartyGroupByName(tenants.businessBId, "customer", "VIP");

    // Same business, same name, different type -> distinct records.
    expect(String(customerGroupA._id)).not.toBe(String(vendorGroupA._id));
    // Same type, same name, different business -> distinct records.
    expect(String(customerGroupA._id)).not.toBe(String(customerGroupB._id));
  });

  it("listAllProducts/listAllCustomers/listAllVendors never include another business's records", async () => {
    const productA = await createProduct({
      businessId: tenants.businessAId,
      name: "Shared Name Product",
      type: "product",
      sellingPriceMinor: 1000,
      priceIsTaxInclusive: false,
      taxRatePercent: 0,
    });
    const productB = await createProduct({
      businessId: tenants.businessBId,
      name: "Shared Name Product",
      type: "product",
      sellingPriceMinor: 2000,
      priceIsTaxInclusive: false,
      taxRatePercent: 0,
    });
    if (!productA.ok || !productB.ok) throw new Error("setup failed");

    const customerA = await createCustomer({ businessId: tenants.businessAId, displayName: "Shared Name" });
    const customerB = await createCustomer({ businessId: tenants.businessBId, displayName: "Shared Name" });
    if (!customerA.ok || !customerB.ok) throw new Error("setup failed");

    const vendorA = await createVendor({ businessId: tenants.businessAId, displayName: "Shared Name" });
    const vendorB = await createVendor({ businessId: tenants.businessBId, displayName: "Shared Name" });
    if (!vendorA.ok || !vendorB.ok) throw new Error("setup failed");

    const productsA = await listAllProducts(tenants.businessAId, { search: "Shared Name" });
    expect(productsA.map((p) => String(p._id))).toContain(String(productA.product._id));
    expect(productsA.map((p) => String(p._id))).not.toContain(String(productB.product._id));
    expect(productsA.every((p) => String(p.businessId) === tenants.businessAId)).toBe(true);

    const customersA = await listAllCustomers(tenants.businessAId, { search: "Shared Name" });
    expect(customersA.map((c) => String(c._id))).toContain(String(customerA.customer._id));
    expect(customersA.map((c) => String(c._id))).not.toContain(String(customerB.customer._id));

    const vendorsA = await listAllVendors(tenants.businessAId, { search: "Shared Name" });
    expect(vendorsA.map((v) => String(v._id))).toContain(String(vendorA.vendor._id));
    expect(vendorsA.map((v) => String(v._id))).not.toContain(String(vendorB.vendor._id));
  });
});
