import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  listProducts,
  findProductById,
  createProduct,
  updateProduct,
  softDeleteProduct,
  restoreProduct,
} from "@/lib/db/queries/products";
import { createProductCategory } from "@/lib/db/queries/productCategories";
import { createProductGroup } from "@/lib/db/queries/productGroups";
import { createPriceList } from "@/lib/db/queries/priceLists";
import { Product } from "@/lib/db/models/Product";
import { ProductCategory } from "@/lib/db/models/ProductCategory";
import { ProductGroup } from "@/lib/db/models/ProductGroup";
import { PriceList } from "@/lib/db/models/PriceList";

describe("products — tenant isolation", () => {
  let tenants: TwoTenants;
  let categoryAId: string;
  let categoryBId: string;
  let groupAId: string;
  let groupBId: string;
  let priceListAId: string;
  let priceListBId: string;
  let productAId: string;
  let productBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("products");

    const categoryA = await createProductCategory({
      businessId: tenants.businessAId,
      name: "Widgets",
    });
    const categoryB = await createProductCategory({
      businessId: tenants.businessBId,
      name: "Widgets",
    });
    categoryAId = String(categoryA._id);
    categoryBId = String(categoryB._id);

    const groupA = await createProductGroup({ businessId: tenants.businessAId, name: "Summer" });
    const groupB = await createProductGroup({ businessId: tenants.businessBId, name: "Summer" });
    groupAId = String(groupA._id);
    groupBId = String(groupB._id);

    const priceListA = await createPriceList({ businessId: tenants.businessAId, name: "Retail" });
    const priceListB = await createPriceList({ businessId: tenants.businessBId, name: "Retail" });
    priceListAId = String(priceListA._id);
    priceListBId = String(priceListB._id);

    const resultA = await createProduct({
      businessId: tenants.businessAId,
      name: "Widget",
      type: "product",
      sellingPriceMinor: 10000,
      priceIsTaxInclusive: false,
      taxRatePercent: 18,
      categoryId: categoryAId,
      groupId: groupAId,
      variants: [{ name: "Red" }, { name: "Blue" }],
      priceOverrides: [{ priceListId: priceListAId, priceMinor: 9000 }],
    });
    const resultB = await createProduct({
      businessId: tenants.businessBId,
      name: "Widget",
      type: "product",
      sellingPriceMinor: 10000,
      priceIsTaxInclusive: false,
      taxRatePercent: 18,
    });
    if (!resultA.ok || !resultB.ok) throw new Error("setup failed");
    productAId = String(resultA.product._id);
    productBId = String(resultB.product._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      Product.deleteMany({ businessId: { $in: businessIds } }),
      ProductCategory.deleteMany({ businessId: { $in: businessIds } }),
      ProductGroup.deleteMany({ businessId: { $in: businessIds } }),
      PriceList.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("listProducts never returns another business's products", async () => {
    const { items } = await listProducts(tenants.businessAId);
    expect(items.map((p) => String(p._id))).toContain(productAId);
    expect(items.map((p) => String(p._id))).not.toContain(productBId);
  });

  it("findProductById refuses a product belonging to a different business", async () => {
    expect(await findProductById(productBId, tenants.businessAId)).toBeNull();
    const productA = await findProductById(productAId, tenants.businessAId);
    expect(productA).not.toBeNull();
    expect(productA?.variants).toHaveLength(2);
    expect(productA?.priceOverrides).toHaveLength(1);
  });

  it("filtering by another business's categoryId/groupId returns nothing", async () => {
    const byCategory = await listProducts(tenants.businessAId, { categoryId: categoryBId });
    expect(byCategory.items).toHaveLength(0);
    const byGroup = await listProducts(tenants.businessAId, { groupId: groupBId });
    expect(byGroup.items).toHaveLength(0);
  });

  it("createProduct rejects a categoryId belonging to a different business", async () => {
    const result = await createProduct({
      businessId: tenants.businessAId,
      name: "Should Fail",
      type: "product",
      sellingPriceMinor: 100,
      priceIsTaxInclusive: false,
      taxRatePercent: 0,
      categoryId: categoryBId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_category");
  });

  it("createProduct rejects a groupId belonging to a different business", async () => {
    const result = await createProduct({
      businessId: tenants.businessAId,
      name: "Should Fail",
      type: "product",
      sellingPriceMinor: 100,
      priceIsTaxInclusive: false,
      taxRatePercent: 0,
      groupId: groupBId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_group");
  });

  it("createProduct rejects a priceOverrides priceListId belonging to a different business", async () => {
    const result = await createProduct({
      businessId: tenants.businessAId,
      name: "Should Fail",
      type: "product",
      sellingPriceMinor: 100,
      priceIsTaxInclusive: false,
      taxRatePercent: 0,
      priceOverrides: [{ priceListId: priceListBId, priceMinor: 100 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_price_lists");
  });

  it("updateProduct rejects a foreign categoryId", async () => {
    const result = await updateProduct(productAId, tenants.businessAId, {
      categoryId: categoryBId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_category");
  });

  it("soft-delete moves a product out of the active list without hard-deleting it", async () => {
    await softDeleteProduct(productAId, tenants.businessAId);

    const active = await listProducts(tenants.businessAId, { tab: "active" });
    expect(active.items.map((p) => String(p._id))).not.toContain(productAId);

    const deleted = await listProducts(tenants.businessAId, { tab: "deleted" });
    expect(deleted.items.map((p) => String(p._id))).toContain(productAId);

    const stillExists = await Product.findById(productAId);
    expect(stillExists).not.toBeNull();
    expect(stillExists?.deletedAt).toBeInstanceOf(Date);

    await restoreProduct(productAId, tenants.businessAId);
  });
});
